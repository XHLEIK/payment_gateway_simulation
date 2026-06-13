import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Payment requests statuses. Requests expire if not paid/acted on within 30 days.
export enum PaymentRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

@Entity('payment_requests')
export class PaymentRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payer_id' })
  payerId: string; // The candidate who is requested to pay

  @Column({ name: 'payee_id' })
  payeeId: string; // The candidate who created the request and receives funds

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
    default: PaymentRequestStatus.PENDING,
  })
  status: PaymentRequestStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  // Relationship to the target user (payer)
  @ManyToOne(() => User)
  @JoinColumn({ name: 'payer_id' })
  payer: User;

  // Relationship to the requester user (payee)
  @ManyToOne(() => User)
  @JoinColumn({ name: 'payee_id' })
  payee: User;
}
