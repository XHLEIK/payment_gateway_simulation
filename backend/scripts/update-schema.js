// Migration support script to update existing database installations.
// Adds dispute resolution features, audit tracking variables, transaction reversals,
// and notification logs on top of the original schema layout.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Client } = require('pg');

async function updateSchema() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'payment_gateway_db',
  });

  try {
    await client.connect();
    console.log('Connected to payment_gateway_db.');

    // 1. Alter transactions to allow circular/reversal links (linked_transaction_id)
    console.log('Altering transactions table to add reversal columns...');
    await client.query(`
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
      
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS reversal_reason TEXT;
    `);
    console.log('Transactions table altered successfully.');

    // 2. Create the disputes system table for managing customer complaints and chargebacks
    console.log('Creating disputes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS disputes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          evidence TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
          admin_notes TEXT,
          resolved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Partial index to speed up scanning active disputes (open complaints)
      CREATE INDEX IF NOT EXISTS idx_dispute_status ON disputes(status) WHERE status != 'RESOLVED';
      
      -- Prevent a user from opening multiple disputes on the exact same transaction
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dispute_txn_user ON disputes(transaction_id, user_id);
    `);
    console.log('Disputes table created successfully.');

    // 3. Create the notifications logging table (tracks push notification history)
    console.log('Creating notifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(200) NOT NULL,
          message TEXT NOT NULL,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Index to load unread alerts quickly for dashboard badges
      CREATE INDEX IF NOT EXISTS idx_notification_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
    `);
    console.log('Notifications table created successfully.');

    // 4. Create the daily transaction limit configs for users (fintech risk controls)
    console.log('Creating daily_limits table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_limits (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          daily_limit NUMERIC(15, 2) NOT NULL DEFAULT 50000.00,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Daily limits table created successfully.');

    console.log('Schema update complete.');

  } catch (err) {
    console.error('Error updating schema:', err.message);
  } finally {
    await client.end();
  }
}

updateSchema();
