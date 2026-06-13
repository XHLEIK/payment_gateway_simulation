// Development helper to query the system catalogs and verify the schema of the
// transaction_audits table. Good for checking column nullability and types.
const { Client } = require('pg');

async function checkSchema() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Subham@1234',
    database: 'payment_gateway_db',
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // Query information_schema to check the column properties of transaction_audits
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'transaction_audits';
    `);

    console.log('Columns in transaction_audits:');
    console.table(res.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkSchema();
