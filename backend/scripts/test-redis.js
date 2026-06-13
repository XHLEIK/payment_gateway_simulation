// Quick validation tool to verify if Redis is up, running, and accessible.
// Since we use Redis for transaction caching and rate-limiting,
// the NestJS app will fail to startup if Redis is unreachable in dev.
const Redis = require('ioredis');

async function testRedis() {
  const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    connectTimeout: 2000, // Short timeout so we don't hang if it's dead
  });

  try {
    console.log('Connecting to Redis...');
    const result = await redis.ping();
    console.log('Redis connected successfully! PING response:', result);
  } catch (err) {
    console.error('Failed to connect to Redis:', err.message);
    console.log('\nNOTE: Please start Redis locally on port 6379 for the application to function correctly in development.');
  } finally {
    // Gracefully clean up socket connections
    redis.disconnect();
  }
}

testRedis();
