const parseBoolean = (value: string | undefined, defaultValue: boolean) =>
  value === undefined ? defaultValue : value.toLowerCase() === 'true';

const parseOrigins = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'PMS API',
    environment: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    frontendUrl: process.env.APP_FRONTEND_URL ?? 'http://localhost:5173',
    corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
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
  auth: {
    jwtSecret:
      process.env.JWT_SECRET ??
      'development-only-jwt-secret-change-before-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    emailVerificationExpiresInMinutes: Number(
      process.env.EMAIL_VERIFICATION_EXPIRES_IN_MINUTES ?? 1440,
    ),
    passwordResetExpiresInMinutes: Number(
      process.env.PASSWORD_RESET_EXPIRES_IN_MINUTES ?? 30,
    ),
  },
  mail: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? 'PMS <no-reply@localhost>',
  },
  swagger: {
    enabled: parseBoolean(process.env.SWAGGER_ENABLED, true),
    path: process.env.SWAGGER_PATH ?? 'docs',
  },
});
