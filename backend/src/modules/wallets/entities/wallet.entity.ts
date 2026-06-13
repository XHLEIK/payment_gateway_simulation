import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Database entity storing candidate wallet balances.
@Entity('wallets')
// Strict constraint at DB level to prevent account balances from ever going negative
@Check(`"balance" >= 0`)
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // UUID referencing the unique user owner
  @Column({ name: 'user_id', unique: true })
  userId: string;

  // Account balance tracked in INR. Enforces maximum decimal accuracy for money operations.
  @Column('numeric', {
    precision: 15,
    scale: 2,
    default: 0.0,
    // Autotransforms PostgreSQL string decimals to float numbers for TypeScript logic
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balance: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  // Link back to user entity context
  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
