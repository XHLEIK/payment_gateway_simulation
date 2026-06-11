const Redis = require('ioredis');

async function testRedis() {
  const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    connectTimeout: 2000,
  });

  try {
    console.log('Connecting to Redis...');
    const result = await redis.ping();
    console.log('Redis connected successfully! PING response:', result);
  } catch (err) {
    console.error('Failed to connect to Redis:', err.message);
    console.log('\nNOTE: Please start Redis locally on port 6379 for the application to function correctly in development.');
  } finally {
    redis.disconnect();
  }
}

testRedis();
