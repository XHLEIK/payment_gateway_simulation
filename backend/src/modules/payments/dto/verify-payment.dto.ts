import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
