// Core database initialization script. Reads the master schema.sql from the project
// root and executes it to create all tables, indexes, constraints, and mock seed data.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');
const fs = require('fs');

async function seedDb() {
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

    // Locate the schema.sql in the root directory relative to this script
    const sqlPath = path.join(__dirname, '..', '..', 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying schema.sql...');
    // Execute all DDL and initial inserts sequentially
    await client.query(sql);
    console.log('Database schema and seeds applied successfully.');
  } catch (err) {
    console.error('Error seeding database:', err.message);
  } finally {
    // Release connection client back to OS
    await client.end();
  }
}

seedDb();
