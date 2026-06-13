import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/entities/user.entity';

// Current resolution status of a refund claim
export enum RefundStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @Column('numeric', {
    precision: 15,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amount: number;

  @Column()
  reason: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: RefundStatus.PENDING,
  })
  status: RefundStatus;

  // Stores the admin ID who approved or rejected the request
  @Column({ name: 'approved_by', nullable: true })
  approvedById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  // Many refunds can map to the same transaction (e.g. partial refunds)
  @ManyToOne(() => Transaction, (transaction) => transaction.refunds)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  // Tracks which Admin processed this refund
  @ManyToOne(() => User, (user) => user.approvedRefunds)
  @JoinColumn({ name: 'approved_by' })
  approvedBy: User;
}
