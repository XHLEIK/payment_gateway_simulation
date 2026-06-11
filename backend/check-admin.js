const { Client } = require('pg');

async function checkAdmin() {
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

    const res = await client.query(`
      SELECT id, name, email, password_hash, role 
      FROM users;
    `);
    console.log('--- ALL USERS IN DB ---');
    console.table(res.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkAdmin();
