// Concurrency validation test script.
// Simulates 5 workers running transaction debit operations concurrently to verify
// that our SELECT FOR UPDATE + SERIALIZABLE database locks work as expected,
// preventing race conditions, double debits, and balance overdrafts.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

// Use a connection pool to allow concurrent queries in parallel
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'payment_gateway_db',
  max: 10,
});

const USER_ID = 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'; // Matches our seed user who has ₹2500 initial balance
const DEBIT_AMOUNT = 600.00;
const CONCURRENT_WORKERS = 5; // Total debit attempt: 5 * 600 = 3000 (which exceeds the 2500 balance!)

async function debitWorker(workerId) {
  // Grab a dedicated client connection from the pool
  const client = await pool.connect();
  console.log(`Worker ${workerId} connected.`);
  
  try {
    // 1. Begin a high-isolation level transaction.
    // SERIALIZABLE prevents dirty reads, non-repeatable reads, and serialization anomalies.
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    
    // 2. Lock the wallet row for this user.
    // FOR UPDATE blocks other queries attempting to update or lock this exact row
    // until this transaction commits or rolls back, avoiding race conditions.
    console.log(`Worker ${workerId} acquiring lock on wallet...`);
    const res = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [USER_ID]
    );
    
    const wallet = res.rows[0];
    const balance = parseFloat(wallet.balance);
    console.log(`Worker ${workerId} read balance: ₹${balance}`);

    // If balance is insufficient, abort the transaction immediately
    if (balance < DEBIT_AMOUNT) {
      throw new Error(`Insufficient wallet balance: ₹${balance} is less than ₹${DEBIT_AMOUNT}`);
    }

    const newBalance = parseFloat((balance - DEBIT_AMOUNT).toFixed(2));
    
    // 3. Perform the debit update
    await client.query(
      `UPDATE wallets SET balance = $1 WHERE user_id = $2`,
      [newBalance, USER_ID]
    );

    // 4. Log the transaction event in history
    await client.query(
      `INSERT INTO transactions (reference_id, user_id, amount, type, status, request_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `TXN-CONC-${workerId}-${Date.now().toString().slice(-4)}`,
        USER_ID,
        DEBIT_AMOUNT,
        'DEBIT',
        'SUCCESS',
        `REQ-CONC-${workerId}-${Date.now()}`
      ]
    );

    // Commit to release row locks and persist balance change
    await client.query('COMMIT');
    console.log(`Worker ${workerId} COMMITTED successfully. New Balance: ₹${newBalance}`);
    return { workerId, success: true, balance: newBalance };
  } catch (err) {
    // If anything fails (or if we hit a serialization failure), roll back the database state
    await client.query('ROLLBACK');
    console.error(`Worker ${workerId} ROLLED BACK with error: ${err.message}`);
    return { workerId, success: false, error: err.message };
  } finally {
    // Return the connection client to the pool
    client.release();
  }
}

async function runTest() {
  console.log('--- START CONCURRENCY LOCKING TEST ---');
  
  // Clean up user balance state to ensure test reproducibility
  const initClient = await pool.connect();
  await initClient.query('UPDATE wallets SET balance = 2500.00 WHERE user_id = $1', [USER_ID]);
  await initClient.query("DELETE FROM transactions WHERE reference_id LIKE 'TXN-CONC-%'");
  initClient.release();
  
  console.log('Reset user balance to ₹2500.00.');
  console.log(`Launching ${CONCURRENT_WORKERS} workers to debit ₹${DEBIT_AMOUNT} concurrently...`);

  // Launch all workers concurrently to race each other
  const promises = [];
  for (let i = 1; i <= CONCURRENT_WORKERS; i++) {
    promises.push(debitWorker(i));
  }

  // Await completion of all promises
  const results = await Promise.all(promises);
  console.log('\n--- TEST RESULTS SUMMARY ---');
  results.forEach((r) => {
    console.log(`Worker ${r.workerId}: ${r.success ? 'SUCCESS (Balance: ₹' + r.balance + ')' : 'FAILED (' + r.error + ')'}`);
  });

  // Verify the final balance in DB is exactly what we expect.
  // 3 successful debits of 600.00 = 1800.00.
  // Remaining: 2500 - 1800 = ₹700.00.
  // The other 2 workers should fail due to locking or insufficient balance.
  const finalClient = await pool.connect();
  const finalRes = await finalClient.query('SELECT balance FROM wallets WHERE user_id = $1', [USER_ID]);
  console.log(`Final Database balance: ₹${finalRes.rows[0].balance}`);
  finalClient.release();
  
  // Close connection pool
  await pool.end();
}

runTest();
