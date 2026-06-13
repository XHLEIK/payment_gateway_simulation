// Verification script to double-check that database records have valid data.
// Specifically checks for any null states in the transaction audit trail,
// which could indicate a bug in the transaction state transition logger.
const { Client } = require('pg');

async function checkNulls() {
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

    // Query for any transaction audit row that does not specify a target state
    const res = await client.query('SELECT * FROM transaction_audits WHERE to_status IS NULL');
    console.log('Number of rows with null to_status:', res.rowCount);
    if (res.rowCount > 0) {
      console.log('Null rows:', res.rows);
    }

    // Get a baseline metric of total logged actions
    const countRes = await client.query('SELECT COUNT(*) FROM transaction_audits');
    console.log('Total transaction audits:', countRes.rows[0].count);

    // List all tables currently initialized in the database schema
    const tablesRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname='public'
    `);
    console.log('Tables in database:', tablesRes.rows.map(r => r.tablename));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkNulls();
