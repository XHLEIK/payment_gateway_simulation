// Debug script to check what database environment variables Node is reading,
// and what databases are currently active on the running PostgreSQL server.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

async function checkDbs() {
  console.log('--- NODE ENVIRONMENT VARIABLES ---');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_PORT:', process.env.DB_PORT);
  console.log('DB_USERNAME:', process.env.DB_USERNAME);
  console.log('DB_NAME:', process.env.DB_NAME);

  // Connect to the default 'postgres' database first to inspect other databases
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres', 
  });

  try {
    await client.connect();
    console.log('\n--- DATABASES ON POSTGRES ---');
    
    // Select non-template databases to see what's actually created
    const res = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log(res.rows.map(r => r.datname));
  } catch (err) {
    console.error('Error listing databases:', err.message);
  } finally {
    // Clean up connections
    await client.end();
  }
}

checkDbs();
