// Core database initialization script. Reads the master schema.sql from the project
// root and executes it to create all tables, indexes, constraints, and mock seed data.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function seedDb() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Subham@1234',
    database: 'payment_gateway_db',
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
