const { Client } = require('pg');

async function checkTables() {
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

    // List all public tables
    const tablesRes = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);
    console.log('--- TABLES ---');
    console.table(tablesRes.rows);

    // List columns for users
    const usersColRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);
    console.log('--- COLUMNS IN users ---');
    console.table(usersColRes.rows);

    // List columns for payment_requests if exists
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
      console.log('payment_requests table does not exist.');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkTables();
