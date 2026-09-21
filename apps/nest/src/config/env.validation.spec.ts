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
});
