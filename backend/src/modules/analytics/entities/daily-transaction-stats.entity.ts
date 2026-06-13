import { Entity, PrimaryColumn, Column } from 'typeorm';

// Pre-aggregated statistics for dashboard telemetry (weekly/monthly charts)
@Entity('daily_transaction_stats')
export class DailyTransactionStats {
  @PrimaryColumn({ type: 'date' })
  date: string; // Format: 'YYYY-MM-DD'

  @Column({ name: 'success_count', default: 0 })
  successCount: number;

  @Column({ name: 'failed_count', default: 0 })
  failedCount: number;

  @Column('numeric', {
    name: 'total_volume',
    precision: 15,
    scale: 2,
    default: 0.0,
    transformer: {
      // Keep number types in application logic while saving to DB numeric
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  totalVolume: number;

  // New telemetry metrics added for detailed transaction breakdown
  @Column({ name: 'transfer_count', default: 0 })
  transferCount: number;

  @Column({ name: 'refund_count', default: 0 })
  refundCount: number;

  @Column({ name: 'payment_count', default: 0 })
  paymentCount: number;
}
