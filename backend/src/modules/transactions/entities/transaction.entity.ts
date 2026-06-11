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

export enum TransactionType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
  TRANSFER = 'TRANSFER',
}

export enum TransactionStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

@Entity('transactions')
@Index('idx_txn_user_date', ['userId', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'reference_id', unique: true })
  referenceId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column('numeric', {
    precision: 15,
    scale: 2,
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
  @Index('idx_txn_status_partial', { where: `"status" != 'SUCCESS'` })
  status: TransactionStatus;

  @Column({ name: 'gateway_order_id', unique: true, nullable: true })
  gatewayOrderId: string;

  @Column({ name: 'gateway_payment_id', nullable: true })
  gatewayPaymentId: string;

  @Column({ name: 'request_id', unique: true, nullable: true })
  requestId: string; // Idempotency key

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => TransactionAudit, (audit) => audit.transaction, { cascade: true })
  auditLogs: TransactionAudit[];

  @OneToMany(() => Refund, (refund) => refund.transaction)
  refunds: Refund[];
}
