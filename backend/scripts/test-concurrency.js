const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Subham@1234',
  database: 'payment_gateway_db',
  max: 10,
});

const USER_ID = 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c'; // Seed user with ₹2500 balance
const DEBIT_AMOUNT = 600.00;
const CONCURRENT_WORKERS = 5; // 5 workers * ₹600 = ₹3000 (exceeds ₹2500)

async function debitWorker(workerId) {
  const client = await pool.connect();
  console.log(`Worker ${workerId} connected.`);
  
  try {
    // Start serializable transaction
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    
    // Acquire pessimistic write lock
    console.log(`Worker ${workerId} acquiring lock on wallet...`);
    const res = await client.query(
      `SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [USER_ID]
    );
    
    const wallet = res.rows[0];
    const balance = parseFloat(wallet.balance);
    console.log(`Worker ${workerId} read balance: ₹${balance}`);

    if (balance < DEBIT_AMOUNT) {
      throw new Error(`Insufficient wallet balance: ₹${balance} is less than ₹${DEBIT_AMOUNT}`);
    }

    const newBalance = parseFloat((balance - DEBIT_AMOUNT).toFixed(2));
    
    // Perform debit
    await client.query(
      `UPDATE wallets SET balance = $1 WHERE user_id = $2`,
      [newBalance, USER_ID]
    );

    // Insert mock debit transaction for history
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

    await client.query('COMMIT');
    console.log(`Worker ${workerId} COMMITTED successfully. New Balance: ₹${newBalance}`);
    return { workerId, success: true, balance: newBalance };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Worker ${workerId} ROLLED BACK with error: ${err.message}`);
    return { workerId, success: false, error: err.message };
  } finally {
    client.release();
  }
}

async function runTest() {
  console.log('--- START CONCURRENCY LOCKING TEST ---');
  
  // Set balance back to ₹2500 first for a clean run
  const initClient = await pool.connect();
  await initClient.query('UPDATE wallets SET balance = 2500.00 WHERE user_id = $1', [USER_ID]);
  await initClient.query("DELETE FROM transactions WHERE reference_id LIKE 'TXN-CONC-%'");
  initClient.release();
  
  console.log('Reset user balance to ₹2500.00.');
  console.log(`Launching ${CONCURRENT_WORKERS} workers to debit ₹${DEBIT_AMOUNT} concurrently...`);

  // Launch all workers simultaneously
  const promises = [];
  for (let i = 1; i <= CONCURRENT_WORKERS; i++) {
    promises.push(debitWorker(i));
  }

  const results = await Promise.all(promises);
  console.log('\n--- TEST RESULTS SUMMARY ---');
  results.forEach((r) => {
    console.log(`Worker ${r.workerId}: ${r.success ? 'SUCCESS (Balance: ₹' + r.balance + ')' : 'FAILED (' + r.error + ')'}`);
  });

  // Fetch final balance to verify
  const finalClient = await pool.connect();
  const finalRes = await finalClient.query('SELECT balance FROM wallets WHERE user_id = $1', [USER_ID]);
  console.log(`Final Database balance: ₹${finalRes.rows[0].balance}`);
  finalClient.release();
  
  await pool.end();
}

runTest();
