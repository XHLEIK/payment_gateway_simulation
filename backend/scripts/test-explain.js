// Optimization analysis script.
// Runs EXPLAIN ANALYZE on our most frequent query (fetching user transaction history).
// Helps us verify if PostgreSQL is using the index scan rather than a slow sequential table scan.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

async function runExplain() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'payment_gateway_db',
  });

  try {
    await client.connect();
    console.log('Connected to database. Running EXPLAIN ANALYZE on user transaction query...');

    // Use the seeded test user UUID
    const userId = 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c';
    
    // EXPLAIN ANALYZE actually executes the query and prints out execution costs,
    // actual time taken, rows read, and the index used.
    const query = `
      EXPLAIN ANALYZE 
      SELECT * FROM transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `;

    const res = await client.query(query, [userId]);
    console.log('\n--- PostgreSQL Execution Plan ---');
    
    // Loop through the query plan rows printed by Postgres
    res.rows.forEach((row) => {
      console.log(row['QUERY PLAN']);
    });
  } catch (err) {
    console.error('Error running EXPLAIN:', err.message);
  } finally {
    await client.end();
  }
}

runExplain();
