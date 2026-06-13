import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/entities/user.entity';

// Current lifecycle status of a candidate dispute
export enum DisputeStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

@Entity('disputes')
// Compound constraint ensuring a user can file at most one dispute per transaction
@Unique('uq_dispute_txn_user', ['transactionId', 'userId'])
// Partial index to speed up lookup of open/unresolved disputes
@Index('idx_dispute_status_open', ['status'], { where: `"status" NOT IN ('RESOLVED', 'REJECTED')` })
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id' })
  transactionId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column('text')
  reason: string;

  @Column('text', { nullable: true })
  evidence: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: DisputeStatus.OPEN,
  })
  status: DisputeStatus;

  // Notes added by the reviewing administrator during resolution
  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  // Tracks which Admin processed this dispute
  @Column({ name: 'resolved_by_id', type: 'varchar', nullable: true })
  resolvedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @ManyToOne(() => Transaction)
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'resolved_by_id' })
  resolvedBy: User;
}
