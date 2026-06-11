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

    const res = await client.query('SELECT * FROM transaction_audits WHERE to_status IS NULL');
    console.log('Number of rows with null to_status:', res.rowCount);
    if (res.rowCount > 0) {
      console.log('Null rows:', res.rows);
    }

    const countRes = await client.query('SELECT COUNT(*) FROM transaction_audits');
    console.log('Total transaction audits:', countRes.rows[0].count);

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
