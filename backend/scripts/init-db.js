const { Client } = require('pg');

async function initDb() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Subham@1234',
    database: 'postgres', // Connect to default postgres DB first
  });

  try {
    await client.connect();
    console.log('Connected to default postgres database.');

    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'payment_gateway_db'`);
    if (res.rowCount === 0) {
      console.log('Database payment_gateway_db does not exist. Creating...');
      await client.query('CREATE DATABASE payment_gateway_db');
      console.log('Database payment_gateway_db created successfully.');
    } else {
      console.log('Database payment_gateway_db already exists.');
    }
  } catch (err) {
    console.error('Error initializing database:', err.message);
  } finally {
    await client.end();
  }
}

initDb();
