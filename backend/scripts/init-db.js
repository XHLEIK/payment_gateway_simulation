// Bootstrapping script to check if our target database 'payment_gateway_db'
// exists, and if not, creates it. This should be run before running TypeORM migrations
// or schema initialization.
const { Client } = require('pg');

async function initDb() {
  // Connect to default system 'postgres' DB because we can't connect to
  // a database that doesn't exist yet to create it.
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Subham@1234',
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
