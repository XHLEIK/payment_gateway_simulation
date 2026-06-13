import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Transaction, TransactionStatus } from './transaction.entity';

// Database audit entity storing trace history of status transitions
// for financial transactions (e.g. INITIATED -> SUCCESS, PROCESSING -> FAILED).
// Essential for compliance, resolving candidate balance disputes, and debugging webhook failures.
@Entity('transaction_audits')
export class TransactionAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Link to the target transaction record
  @Column({ name: 'transaction_id' })
  transactionId: string;

  // The state the transaction was in before this event (null if initiating a new txn)
  @Column({
    name: 'from_status',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  fromStatus: TransactionStatus | null;

  // The state the transaction transitioned to
  @Column({
    name: 'to_status',
    type: 'varchar',
    length: 50,
  })
  toStatus: TransactionStatus;

  // Identifies who/what triggered this change (e.g., 'system:webhook', 'admin:UUID', 'user')
  @Column()
  actor: string;

  // Correlation ID from HTTP request tracer header, linking multiple services under one trace
  @Column({ name: 'correlation_id', nullable: true })
  correlationId: string;

  // Log timestamp
  @CreateDateColumn({ name: 'timestamp', type: 'timestamp with time zone' })
  timestamp: Date;

  // Establishes child-parent relationship. Cascades deletes if transaction parent is removed.
  @ManyToOne(() => Transaction, (transaction) => transaction.auditLogs)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;
}
