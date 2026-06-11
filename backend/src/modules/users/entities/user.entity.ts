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

  @Column({ name: 'transaction_pin_hash', type: 'varchar', nullable: true })
  transactionPinHash: string | null;

  @Column({ name: 'pin_attempts', type: 'integer', default: 0 })
  pinAttempts: number;

  @Column({ name: 'pin_locked_until', type: 'timestamp with time zone', nullable: true })
  pinLockedUntil: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToOne(() => Wallet, (wallet) => wallet.user, { cascade: true })
  wallet: Wallet;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Transaction[];

  @OneToMany(() => Refund, (refund) => refund.approvedBy)
  approvedRefunds: Refund[];
}
