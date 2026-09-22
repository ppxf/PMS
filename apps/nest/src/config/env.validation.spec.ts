import { validateEnvironment } from './env.validation';

describe('validateEnvironment authentication settings', () => {
  it('rejects production configuration without a JWT secret', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('rejects a short production JWT secret', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('accepts production without administrator bootstrap settings', () => {
    const config = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM: 'PMS <no-reply@example.com>',
      APP_FRONTEND_URL: 'https://pms.example.com',
      CORS_ORIGINS: 'https://pms.example.com',
      MONITORING_PUBLIC_URL: 'https://monitor.example.com',
    };

    expect(validateEnvironment(config)).toBe(config);
  });

  it('accepts development defaults', () => {
    expect(validateEnvironment({ NODE_ENV: 'development' })).toEqual({
      NODE_ENV: 'development',
    });
  });

  it('accepts a duration string for JWT expiry', () => {
    const config = { NODE_ENV: 'development', JWT_EXPIRES_IN: '2h' };

    expect(validateEnvironment(config)).toBe(config);
  });

  it('requires SMTP and frontend URL settings in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
      }),
    ).toThrow('SMTP_HOST');
  });

  it('accepts complete production mail settings', () => {
    const config = {
      NODE_ENV: 'production',
      JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      SMTP_FROM: 'PMS <no-reply@example.com>',
      APP_FRONTEND_URL: 'https://pms.example.com',
      CORS_ORIGINS: 'https://pms.example.com',
      MONITORING_PUBLIC_URL: 'https://monitor.example.com',
      EMAIL_VERIFICATION_EXPIRES_IN_MINUTES: '1440',
      PASSWORD_RESET_EXPIRES_IN_MINUTES: '30',
    };

    expect(validateEnvironment(config)).toBe(config);
  });

  it('requires an explicit CORS allowlist in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'PMS <no-reply@example.com>',
        APP_FRONTEND_URL: 'https://pms.example.com',
      }),
    ).toThrow('CORS_ORIGINS');
  });

  it('rejects a wildcard CORS origin in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'PMS <no-reply@example.com>',
        APP_FRONTEND_URL: 'https://pms.example.com',
        CORS_ORIGINS: '*',
        MONITORING_PUBLIC_URL: 'https://monitor.example.com',
      }),
    ).toThrow('CORS_ORIGINS');
  });

  it('requires a monitoring public URL in production', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'PMS <no-reply@example.com>',
        APP_FRONTEND_URL: 'https://pms.example.com',
        CORS_ORIGINS: 'https://pms.example.com',
      }),
    ).toThrow('MONITORING_PUBLIC_URL');
  });

  it('requires HTTPS for the production monitoring public URL', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        JWT_SECRET: 'a-production-jwt-secret-with-32-characters',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'PMS <no-reply@example.com>',
        APP_FRONTEND_URL: 'https://pms.example.com',
        CORS_ORIGINS: 'https://pms.example.com',
        MONITORING_PUBLIC_URL: 'http://monitor.example.com',
      }),
    ).toThrow('MONITORING_PUBLIC_URL');
  });
});
