// Diagnostic script to check all public tables and print column metadata
// for both 'users' and 'payment_requests' to make sure the database is aligned
// with our NestJS entities.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

async function checkTables() {
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

    // List all user-created tables in the public schema
    const tablesRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);
    console.log('--- TABLES ---');
    console.table(tablesRes.rows);

    // List out details of the 'users' table columns (checks for PIN lock variables, etc.)
    const usersColRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    console.log('--- COLUMNS IN users ---');
    console.table(usersColRes.rows);

    // Inspect 'payment_requests' columns if the table exists (useful for tracking expiration variables)
    const payReqsExist = tablesRes.rows.some(r => r.tablename === 'payment_requests');
    if (payReqsExist) {
      const payReqsColRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'payment_requests'
        ORDER BY ordinal_position;
      `);
      console.log('--- COLUMNS IN payment_requests ---');
      console.table(payReqsColRes.rows);
    } else {
      console.log('payment_requests table does not exist yet. Run init-db.js first.');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkTables();
