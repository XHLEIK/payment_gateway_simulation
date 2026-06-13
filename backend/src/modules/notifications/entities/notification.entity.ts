import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Alert categories for customer/candidate notification events
export enum NotificationType {
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',       // Received funds via direct transfer
  REVERSAL_REQUESTED = 'REVERSAL_REQUESTED',   // Reversal claim submitted
  REVERSAL_APPROVED = 'REVERSAL_APPROVED',     // Reversal approved by admin
  REVERSAL_REJECTED = 'REVERSAL_REJECTED',     // Reversal denied by admin
  REFUND_APPROVED = 'REFUND_APPROVED',         // Payment refund succeeded
  REFUND_REJECTED = 'REFUND_REJECTED',         // Refund request rejected
  DISPUTE_UPDATED = 'DISPUTE_UPDATED',         // Dispute status changed
  PROCESSING_APPROVED = 'PROCESSING_APPROVED', // Processing transaction has been approved
  PROCESSING_REJECTED = 'PROCESSING_REJECTED', // Processing transaction was rejected
  LIMIT_WARNING = 'LIMIT_WARNING',             // Approaching spending limits warning
}

// User-facing alerts logger. Renders inside dashboard notifications feed.
@Entity('notifications')
// Partial index to pull unread messages quickly for dashboard badges
@Index('idx_notification_user_unread', ['userId', 'isRead'], { where: `"is_read" = false` })
// Index for sorting notifications by date
@Index('idx_notification_user_created', ['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The candidate user target for this notification
  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  type: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column('text')
  message: string;

  // Track if user has seen/acknowledged this alert
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  // Flexible JSON store for adding context like transaction references, dispute IDs, etc.
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
