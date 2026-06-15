// Database seeding script for populating realistic mock transactions,
// users, wallets, and disputes for demonstration/test runs.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');
const crypto = require('crypto');

// Standard Bcrypt password hash for: 'Subham@1234'
const bcryptHash = '$2b$10$RA.jVR8hPL4kL/JXN9FvuO8MC/IG3SIVh7tbnoWJ2n4iUuiXqD7v2'; 

// Array of mock users with Regilly domain emails for demonstration.
// Stored with seed balances to simulate account activity.
const users = [
  { id: 'f5e4d3c2-b1a0-9f8e-7d6c-5b4a3f2e1d0c', name: 'Subham Bose', email: 'user@regilly.com', role: 'user', balance: 2500.00 },
  { id: crypto.randomUUID(), name: 'Ayang Pertin', email: 'ayang.pertin@regilly.com', role: 'user', balance: 1500.00 },
  { id: crypto.randomUUID(), name: 'Tashi Namgyal', email: 'tashi.namgyal@regilly.com', role: 'user', balance: 4500.00 },
  { id: crypto.randomUUID(), name: 'Yomgo Bagra', email: 'yomgo.bagra@regilly.com', role: 'user', balance: 800.00 },
  { id: crypto.randomUUID(), name: 'Dugi Tami', email: 'dugi.tami@regilly.com', role: 'user', balance: 12000.00 },
  { id: crypto.randomUUID(), name: 'Lobsang Wangdu', email: 'lobsang.wangdu@regilly.com', role: 'user', balance: 350.00 },
  { id: crypto.randomUUID(), name: 'Kime Sunku', email: 'kime.sunku@regilly.com', role: 'user', balance: 6700.00 },
  { id: crypto.randomUUID(), name: 'Dani Hancock', email: 'dani.hancock@regilly.com', role: 'user', balance: 150.00 },
  { id: crypto.randomUUID(), name: 'Padi Laji', email: 'padi.laji@regilly.com', role: 'user', balance: 8900.00 },
  { id: crypto.randomUUID(), name: 'Likha Sira', email: 'likha.sira@regilly.com', role: 'user', balance: 0.00 },
];

async function seedDemoData() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'payment_gateway_db',
  });

  try {
    await client.connect();
    console.log('Connected to payment_gateway_db to insert demo data.');

    // 1. Drop existing tables and recreate them using schema.sql
    console.log('Dropping existing tables to re-apply clean schema.sql...');
    await client.query('DROP TABLE IF EXISTS refunds, transaction_audits, transactions, wallets, users, daily_transaction_stats CASCADE;');
    
    console.log('Applying schema.sql...');
    const fs = require('fs');
    const path = require('path');
    const sqlPath = path.join(__dirname, '..', '..', 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('Schema applied successfully.');

    // 2. Insert Users and Wallets
    console.log('Inserting/updating 10 demo users...');
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE 
         SET name = EXCLUDED.name, email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
        [u.id, u.name, u.email, bcryptHash, u.role]
      );
      await client.query(
        `INSERT INTO wallets (user_id, balance)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
         SET balance = EXCLUDED.balance`,
        [u.id, u.balance]
      );
    }
    console.log('Inserted/updated 10 users & wallets.');

    // 3. Generate Transactions (50 successful/initiated, 10 failed)
    console.log('Generating 60 transactions across the last 14 days...');
    const transactionStatuses = ['SUCCESS', 'PROCESSING', 'INITIATED'];
    const transactionTypes = ['CREDIT', 'DEBIT'];
    const reasons = ['Application Fee', 'Registration Fee', 'Document Verification', 'Wallet Topup', 'Admit Card Processing'];

    const dates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d);
    }

    const insertedTransactions = [];

    // 50 Success/Processing/Initiated transactions
    for (let i = 0; i < 50; i++) {
      const user = users[i % users.length];
      const type = i % 3 === 0 ? 'CREDIT' : 'DEBIT'; // credit or debit
      const amount = parseFloat((Math.random() * 500 + 50).toFixed(2));
      const status = i < 40 ? 'SUCCESS' : (i < 45 ? 'PROCESSING' : 'INITIATED');
      const date = dates[i % dates.length];
      const refId = `TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const reqId = `REQ-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const gatewayOrderId = status !== 'INITIATED' ? `order_${crypto.randomBytes(6).toString('hex')}` : null;
      const gatewayPaymentId = status === 'SUCCESS' ? `pay_${crypto.randomBytes(6).toString('hex')}` : null;

      // For SUCCESS/DEBIT, make sure the user had enough balance
      let balanceAfter = null;
      if (status === 'SUCCESS') {
        balanceAfter = user.balance; // Mock balanceAfter as current balance
      }

      const res = await client.query(
        `INSERT INTO transactions (reference_id, user_id, amount, type, status, gateway_order_id, gateway_payment_id, request_id, balance_after, created_by, created_by_admin_id, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $10, $11, $11)
         RETURNING id, amount, type, status, created_at`,
        [refId, user.id, amount, type, status, gatewayOrderId, gatewayPaymentId, reqId, balanceAfter, user.id, date]
      );
      insertedTransactions.push(res.rows[0]);

      // Audit logs
      const txnId = res.rows[0].id;
      await client.query(
        `INSERT INTO transaction_audits (transaction_id, from_status, to_status, actor, correlation_id, timestamp)
         VALUES ($1, NULL, 'INITIATED', 'user', $2, $3)`,
        [txnId, crypto.randomUUID(), date]
      );

      if (status !== 'INITIATED') {
        await client.query(
          `INSERT INTO transaction_audits (transaction_id, from_status, to_status, actor, correlation_id, timestamp)
           VALUES ($1, 'INITIATED', $2, 'system', $3, $4)`,
          [txnId, status, crypto.randomUUID(), date]
        );
      }
    }

    // 10 Failed transactions
    for (let i = 0; i < 10; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const type = 'DEBIT';
      const amount = parseFloat((Math.random() * 1000 + 200).toFixed(2));
      const status = 'FAILED';
      const date = dates[i % dates.length];
      const refId = `TXN-FAIL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const reqId = `REQ-FAIL-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      const gatewayOrderId = `order_fail_${crypto.randomBytes(6).toString('hex')}`;

      const res = await client.query(
        `INSERT INTO transactions (reference_id, user_id, amount, type, status, gateway_order_id, request_id, created_by, created_by_admin_id, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $8, $9, $9)
         RETURNING id, amount, type, status, created_at`,
        [refId, user.id, amount, type, status, gatewayOrderId, reqId, user.id, date]
      );
      insertedTransactions.push(res.rows[0]);

      // Audit logs
      const txnId = res.rows[0].id;
      await client.query(
        `INSERT INTO transaction_audits (transaction_id, from_status, to_status, actor, correlation_id, timestamp)
         VALUES ($1, NULL, 'INITIATED', 'user', $2, $3)`,
        [txnId, crypto.randomUUID(), date]
      );
      await client.query(
        `INSERT INTO transaction_audits (transaction_id, from_status, to_status, actor, correlation_id, timestamp)
         VALUES ($1, 'INITIATED', 'FAILED', 'system', $2, $3)`,
        [txnId, crypto.randomUUID(), date]
      );
    }

    console.log(`Inserted ${insertedTransactions.length} transactions (50 ok/processing, 10 failed).`);

    // 4. Create 5 Refund Requests
    console.log('Inserting 5 refund requests...');
    const successfulTxns = insertedTransactions.filter(t => t.status === 'SUCCESS' && t.type === 'DEBIT');
    
    // We will select 5 transactions to refund
    const refundStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'PENDING', 'APPROVED'];
    const refundReasons = ['Double payment', 'Accidental registration', 'Wrong candidate portal select', 'Server error debit', 'Duplicate transaction'];

    for (let i = 0; i < 5; i++) {
      if (i >= successfulTxns.length) break;
      const txn = successfulTxns[i];
      const status = refundStatuses[i];
      const reason = refundReasons[i];
      const amount = txn.amount; // full refund
      const approvedBy = status === 'APPROVED' ? 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' : null;

      await client.query(
        `INSERT INTO refunds (transaction_id, amount, reason, status, approved_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [txn.id, amount, reason, status, approvedBy, txn.created_at]
      );

      if (status === 'APPROVED') {
        // If approved, update transaction status to REFUNDED
        await client.query(
          `UPDATE transactions SET status = 'REFUNDED' WHERE id = $1`,
          [txn.id]
        );
        // Add audit log for transition
        await client.query(
          `INSERT INTO transaction_audits (transaction_id, from_status, to_status, actor, timestamp)
           VALUES ($1, 'SUCCESS', 'REFUNDED', 'admin:a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', $2)`,
          [txn.id, txn.created_at]
        );
      }
    }
    console.log('Inserted 5 refund requests.');

    // 5. Pre-aggregate Daily Statistics for the 14 days
    console.log('Calculating and populating daily_transaction_stats table...');
    for (const d of dates) {
      const dateString = d.toISOString().split('T')[0];
      
      const statsRes = await client.query(
        `SELECT 
           COUNT(CASE WHEN status IN ('SUCCESS', 'REFUNDED') THEN 1 END) as success_count,
           COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
           COALESCE(SUM(CASE WHEN status IN ('SUCCESS', 'REFUNDED') THEN amount ELSE 0 END), 0) as total_volume
         FROM transactions
         WHERE created_at::date = $1`,
        [dateString]
      );

      const stats = statsRes.rows[0];
      await client.query(
        `INSERT INTO daily_transaction_stats (date, success_count, failed_count, total_volume)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (date) DO UPDATE
         SET success_count = EXCLUDED.success_count,
             failed_count = EXCLUDED.failed_count,
             total_volume = EXCLUDED.total_volume`,
        [dateString, parseInt(stats.success_count), parseInt(stats.failed_count), parseFloat(stats.total_volume)]
      );
    }
    console.log('Daily stats populated successfully.');

  } catch (err) {
    console.error('Error seeding demo database:', err.message);
  } finally {
    await client.end();
  }
}

seedDemoData();
