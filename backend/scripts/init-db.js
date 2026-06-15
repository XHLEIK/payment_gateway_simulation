// Bootstrapping script to check if our target database 'payment_gateway_db'
// exists, and if not, creates it. This should be run before running TypeORM migrations
// or schema initialization.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

async function initDb() {
  // Connect to default system 'postgres' DB because we can't connect to
  // a database that doesn't exist yet to create it.
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres', 
  });

  try {
    await client.connect();
    console.log('Connected to default postgres database.');

    // Check pg_database system table to see if the DB exists
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'payment_gateway_db'`);
    if (res.rowCount === 0) {
      console.log('Database payment_gateway_db does not exist. Creating...');
      // CREATE DATABASE cannot be executed inside a transaction block or on the DB being dropped/created
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
