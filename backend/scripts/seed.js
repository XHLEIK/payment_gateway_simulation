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

    const sqlPath = path.join(__dirname, '..', '..', 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Applying schema.sql...');
    await client.query(sql);
    console.log('Database schema and seeds applied successfully.');
  } catch (err) {
    console.error('Error seeding database:', err.message);
  } finally {
    await client.end();
  }
}

seedDb();
