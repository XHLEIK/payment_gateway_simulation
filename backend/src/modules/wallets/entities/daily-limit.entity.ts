import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Database entity storing daily transaction limits per user.
// Designed to mitigate fintech fraud and limit daily loss exposure for candidate accounts.
@Entity('daily_limits')
export class DailyLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Link to the user who owns this limit configuration
  @Column({ name: 'user_id', unique: true })
  userId: string;

  // Numeric limit tracking max allowed daily spend (in INR)
  @Column('numeric', {
    name: 'daily_limit',
    precision: 15,
    scale: 2,
    default: 50000.00, // Default limit set to ₹50,000.00
    // DB numeric types return as strings in pg; transformer converts it to a JS number
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  dailyLimit: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  // Establishes a 1-to-1 relationship between the user and their limit configuration
  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
