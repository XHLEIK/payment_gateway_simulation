const { Client } = require('pg');

async function checkDbs() {
  console.log('--- NODE ENVIRONMENT VARIABLES ---');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DB_HOST:', process.env.DB_HOST);
  console.log('DB_PORT:', process.env.DB_PORT);
  console.log('DB_USERNAME:', process.env.DB_USERNAME);
  console.log('DB_NAME:', process.env.DB_NAME);

  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Subham@1234',
    database: 'postgres', // Connect to default postgres DB
  });

  try {
    await client.connect();
    console.log('\n--- DATABASES ON POSTGRES ---');
    const res = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log(res.rows.map(r => r.datname));
  } catch (err) {
    console.error('Error listing databases:', err.message);
  } finally {
    await client.end();
  }
}

checkDbs();
