const parseBoolean = (value: string | undefined, defaultValue: boolean) =>
  value === undefined ? defaultValue : value.toLowerCase() === 'true';

export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'PMS API',
    environment: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
  },
  database: {
    enabled: parseBoolean(process.env.DB_ENABLED, false),
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'pms',
    synchronize: parseBoolean(process.env.DB_SYNCHRONIZE, false),
    logging: parseBoolean(process.env.DB_LOGGING, false),
  },
  swagger: {
    enabled: parseBoolean(process.env.SWAGGER_ENABLED, true),
    path: process.env.SWAGGER_PATH ?? 'docs',
  },
});
