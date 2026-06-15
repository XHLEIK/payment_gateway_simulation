import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Refund } from '../../refunds/entities/refund.entity';

// Access roles within the Regilly platform
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: UserRole.USER,
  })
  role: UserRole;

  // Hashed 6-digit transaction PIN (bcrypt) for direct transfers and request approvals
  @Column({ name: 'transaction_pin_hash', type: 'varchar', nullable: true })
  transactionPinHash: string | null;

  // Track wrong attempts to implement brute-force lockouts
  @Column({ name: 'pin_attempts', type: 'integer', default: 0 })
  pinAttempts: number;

  // Timestamp when temporary locks expire (kept for compatibility, though we default to manual reset lockouts now)
  @Column({ name: 'pin_locked_until', type: 'timestamp with time zone', nullable: true })
  pinLockedUntil: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  // P2P wallet relationship (one wallet per user)
  @OneToOne(() => Wallet, (wallet) => wallet.user, { cascade: true })
  wallet: Wallet;

  // A user can initiate many deposit/withdrawal transactions
  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Transaction[];

  // Admin-only relationship to keep track of refunds approved by this admin user
  @OneToMany(() => Refund, (refund) => refund.approvedBy)
  approvedRefunds: Refund[];
}
