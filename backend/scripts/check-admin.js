// Simple utility script to inspect users currently stored in our local database.
// Very useful to verify if the seed script actually worked and what roles are set.
const { Client } = require('pg');

async function checkAdmin() {
  // Database connection credentials (matches local docker-compose / pg configuration)
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

    // Fetch details of all registered users to see who has admin privileges
    const res = await client.query(`
      SELECT id, name, email, password_hash, role 
      FROM users;
    `);
    console.log('--- ALL USERS IN DB ---');
    console.table(res.rows); // console.table prints it as a nice clean grid

  } catch (err) {
    console.error('Error running checkAdmin query:', err.message);
  } finally {
    // Always make sure to release the connection resource when done
    await client.end();
  }
}

// Run immediately when calling `node check-admin.js`
checkAdmin();
