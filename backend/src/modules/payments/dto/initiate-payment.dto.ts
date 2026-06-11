import { IsNumber, IsEnum, IsString, IsNotEmpty, Min } from 'class-validator';
import { TransactionType } from '../../transactions/entities/transaction.entity';

export class InitiatePaymentDto {
  @IsNumber()
  @Min(0.01, { message: 'Amount must be at least 0.01' })
  amount: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsString()
  @IsNotEmpty({ message: 'requestId is required for idempotency check' })
  requestId: string;
}
