// Simple utility script to inspect users currently stored in our local database.
// Very useful to verify if the seed script actually worked and what roles are set.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

async function checkAdmin() {
  // Database connection credentials (matches local docker-compose / pg configuration)
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'payment_gateway_db',
  });

  try {
    await client.connect();
    console.log('Connected to payment_gateway_db.');

    // Fetch details of all registered users to see who has admin privileges
    const res = await client.query(`
      SELECT id, name, email, password_hash, role 
      FROM users;
    `);
    console.log('--- ALL USERS IN DB ---');
    console.table(res.rows); // console.table prints it as a nice clean grid

  } catch (err) {
    console.error('Error running checkAdmin query:', err.message);
  } finally {
    // Always make sure to release the connection resource when done
    await client.end();
  }
}

// Run immediately when calling `node check-admin.js`
checkAdmin();
