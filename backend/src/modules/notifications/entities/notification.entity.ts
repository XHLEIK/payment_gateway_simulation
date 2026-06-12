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

export enum NotificationType {
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  REVERSAL_REQUESTED = 'REVERSAL_REQUESTED',
  REVERSAL_APPROVED = 'REVERSAL_APPROVED',
  REVERSAL_REJECTED = 'REVERSAL_REJECTED',
  REFUND_APPROVED = 'REFUND_APPROVED',
  REFUND_REJECTED = 'REFUND_REJECTED',
  DISPUTE_UPDATED = 'DISPUTE_UPDATED',
  PROCESSING_APPROVED = 'PROCESSING_APPROVED',
  PROCESSING_REJECTED = 'PROCESSING_REJECTED',
  LIMIT_WARNING = 'LIMIT_WARNING',
}

@Entity('notifications')
@Index('idx_notification_user_unread', ['userId', 'isRead'], { where: `"is_read" = false` })
@Index('idx_notification_user_created', ['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
