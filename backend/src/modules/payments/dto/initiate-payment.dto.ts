import { IsNumber, IsEnum, IsString, IsNotEmpty, Min } from 'class-validator';
import { TransactionType } from '../../transactions/entities/transaction.entity';

// Data Transfer Object for initiating a payment gateway checkout session.
export class InitiatePaymentDto {
  // Checks that amount is numeric and positive
  @IsNumber()
  @Min(0.01, { message: 'Amount must be at least 0.01' })
  amount: number;

  @IsEnum(TransactionType)
  type: TransactionType;

  // We require requestId to implement strict idempotency keys,
  // preventing double-debits from double-clicking submit buttons.
  @IsString()
  @IsNotEmpty({ message: 'requestId is required for idempotency check' })
  requestId: string;
}
