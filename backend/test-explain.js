const { Client } = require('pg');

async function runExplain() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Subham@1234',
    database: 'payment_gateway_db',
  });

  try {
    await client.connect();
    console.log('Connected to database. Running EXPLAIN ANALYZE on user transaction query...');

    const userId = 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c';
    const query = `
      EXPLAIN ANALYZE 
      SELECT * FROM transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `;

    const res = await client.query(query, [userId]);
    console.log('\n--- PostgreSQL Execution Plan ---');
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
