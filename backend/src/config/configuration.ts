export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  env: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'Subham@1234',
    name: process.env.DB_NAME || 'payment_gateway_db',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'regilly_super_secret_fintech_key_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'regilly_webhook_secret_hmac_key_2026',
  },
});
