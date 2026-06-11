import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Transaction, TransactionStatus } from './transaction.entity';

@Entity('transaction_audits')
export class TransactionAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @Column({
    name: 'from_status',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  fromStatus: TransactionStatus | null;

  @Column({
    name: 'to_status',
    type: 'varchar',
    length: 50,
  })
  toStatus: TransactionStatus;

  @Column()
  actor: string; // 'system' | 'user' | 'admin'

  @Column({ name: 'correlation_id', nullable: true })
  correlationId: string;

  @CreateDateColumn({ name: 'timestamp', type: 'timestamp with time zone' })
  timestamp: Date;

  @ManyToOne(() => Transaction, (transaction) => transaction.auditLogs)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;
}
