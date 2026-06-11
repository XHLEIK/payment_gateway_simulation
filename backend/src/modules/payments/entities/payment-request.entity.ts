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
  payerId: string;

  @Column({ name: 'payee_id' })
  payeeId: string;

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

  @ManyToOne(() => User)
  @JoinColumn({ name: 'payer_id' })
  payer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'payee_id' })
  payee: User;
}
