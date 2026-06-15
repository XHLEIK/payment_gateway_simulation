import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { TransactionAudit } from './transaction-audit.entity';
import { Refund } from '../../refunds/entities/refund.entity';

// Enumerate the type of fund transfers possible in the application
export enum TransactionType {
  CREDIT = 'CREDIT',                     // Directly credited by admin
  DEBIT = 'DEBIT',                       // Direct debit from wallet
  PAYMENT = 'PAYMENT',                   // Standard payment checkout flow
  REFUND = 'REFUND',                     // Reversal of checkout payment
  TRANSFER = 'TRANSFER',                 // Direct wallet-to-wallet transfer sender record
  TRANSFER_CREDIT = 'TRANSFER_CREDIT',   // Direct wallet-to-wallet transfer receiver record
}

// Transaction lifecycle states
export enum TransactionStatus {
  INITIATED = 'INITIATED',               // Check-out initiated, awaiting payment verification
  PROCESSING = 'PROCESSING',             // Payment processing by simulated gateway or pending admin approval
  SUCCESS = 'SUCCESS',                   // Final success, wallet balance adjusted
  FAILED = 'FAILED',                     // Gateway reported failed payment, or transaction rejected
  REFUNDED = 'REFUNDED',                 // Fully or partially refunded checkout payment
  REVERSAL_PENDING = 'REVERSAL_PENDING', // Awaiting admin authorization to reverse a completed transaction
  REVERSED = 'REVERSED',                 // Reversal approved, money moved back to sender
}

// Primary transaction tracking record.
@Entity('transactions')
// Index user transactions by date to optimize dashboard history lookups
@Index('idx_txn_user_date', ['userId', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Human-readable reference ID (e.g. TXN-D8F2B1) exposed to candidate users
  @Column({ name: 'reference_id', unique: true })
  referenceId: string;

  // The owner user ID who initiated/owns this transaction
  @Column({ name: 'user_id' })
  userId: string;

  // The financial value of the transfer
  @Column('numeric', {
    precision: 15,
    scale: 2,
    // Convert pg decimal type to JS float at runtime
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amount: number;

  @Column({
    type: 'varchar',
    length: 50,
  })
  type: TransactionType;

  @Column({
    type: 'varchar',
    length: 50,
    default: TransactionStatus.INITIATED,
  })
  // Partial index to speed up scanning incomplete transactions (helps clear admin processing queues)
  @Index('idx_txn_status_partial', { where: `"status" != 'SUCCESS'` })
  status: TransactionStatus;

  // Simulated gateway parameters
  @Column({ name: 'gateway_order_id', unique: true, nullable: true })
  gatewayOrderId: string;

  @Column({ name: 'gateway_payment_id', nullable: true })
  gatewayPaymentId: string;

  // Client-supplied idempotency key to prevent double transaction execution
  @Column({ name: 'request_id', unique: true, nullable: true })
  requestId: string;

  // Cache user balance immediately after transaction processed (useful for audit check reports)
  @Column('numeric', {
    name: 'balance_after',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => value ? parseFloat(value) : null,
    },
  })
  balanceAfter: number | null;

  // References another transaction if this is a reversal/refund event
  @Column({ name: 'linked_transaction_id', type: 'varchar', nullable: true })
  linkedTransactionId: string | null;

  @Column({ name: 'reversal_reason', type: 'varchar', nullable: true })
  reversalReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  // Relations mapping
  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => TransactionAudit, (audit) => audit.transaction, { cascade: true })
  auditLogs: TransactionAudit[];

  @OneToMany(() => Refund, (refund) => refund.transaction)
  refunds: Refund[];
}
