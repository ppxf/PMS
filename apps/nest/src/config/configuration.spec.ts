import configuration from './configuration';

describe('configuration CORS settings', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    delete process.env.CORS_ORIGINS;
    delete process.env.PUBLIC_URL;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('allows the standard Vite hosts during local development', () => {
    process.env.NODE_ENV = 'development';

    expect(configuration().app.corsOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3002',
    ]);
    expect(configuration().monitoring).not.toHaveProperty('corsOrigins');
  });

  it('normalizes a comma-separated origin allowlist', () => {
    process.env.CORS_ORIGINS =
      ' https://pms.example.com, , https://shop.example.com ';

    expect(configuration().app.corsOrigins).toEqual([
      'https://pms.example.com',
      'https://shop.example.com',
    ]);
  });

  it('uses the local monitoring address by default', () => {
    expect(configuration().monitoring.publicUrl).toBe('http://localhost:3001');
  });

  it('uses PUBLIC_URL as the monitoring address', () => {
    process.env.PUBLIC_URL = 'https://monitor.example.com';

    expect(configuration().monitoring.publicUrl).toBe(
      'https://monitor.example.com',
    );
  });
});
