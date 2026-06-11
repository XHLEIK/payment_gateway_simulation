import { Entity, PrimaryColumn, Column } from 'typeorm';

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
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  totalVolume: number;
}
