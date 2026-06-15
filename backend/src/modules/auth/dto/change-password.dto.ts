import { IsString, MinLength } from 'class-validator';

// Data Transfer Object for secure password changes.
export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(12, { message: 'New password must be at least 12 characters long' })
  newPassword: string;

  @IsString()
  @MinLength(12, { message: 'Password confirmation must be at least 12 characters long' })
  confirmNewPassword: string;
}
