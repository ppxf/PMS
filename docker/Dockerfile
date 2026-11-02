# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS development
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/nest/package.json apps/nest/package.json
COPY apps/vue3/package.json apps/vue3/package.json
COPY packages/config/package.json packages/config/package.json
RUN --mount=type=cache,id=pms-pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=pms-pnpm-metadata,target=/pnpm/cache \
    pnpm --filter "@pms/nest..." --filter "@pms/vue3..." install \
    --frozen-lockfile --store-dir /pnpm/store --cache-dir /pnpm/cache
COPY . .

FROM development AS api-build
RUN pnpm --filter @pms/nest build
# Keep the workspace layout and symlinks, but discard development dependencies.
RUN --mount=type=cache,id=pms-pnpm-store,target=/pnpm/store \
    --mount=type=cache,id=pms-pnpm-metadata,target=/pnpm/cache \
    CI=true pnpm --filter "@pms/nest..." install --prod --frozen-lockfile \
    --ignore-scripts --store-dir /pnpm/store --cache-dir /pnpm/cache

FROM node:24-bookworm-slim AS api-production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build --chown=node:node /app/node_modules ./node_modules
COPY --from=api-build --chown=node:node /app/apps/nest/node_modules ./apps/nest/node_modules
COPY --from=api-build --chown=node:node /app/apps/nest/dist ./apps/nest/dist
COPY --from=api-build --chown=node:node /app/apps/nest/package.json ./apps/nest/package.json
WORKDIR /app/apps/nest
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM development AS web-build
ENV VITE_API_BASE_URL=/api
RUN pnpm --filter @pms/vue3 build

FROM nginx:stable-alpine AS web-production
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/vue3/dist /usr/share/nginx/html
EXPOSE 80
