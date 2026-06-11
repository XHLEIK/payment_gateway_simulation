import { Controller, Get, Post, Body, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }));
  }

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Candidate with this email does not exist');
    }
    return {
      exists: true,
      name: user.name,
      email: user.email,
    };
  }

  @Get('has-pin')
  async hasPin(@CurrentUser() user: any) {
    const hasPin = await this.usersService.hasPin(user.userId);
    return { hasPin };
  }

  @Post('set-pin')
  async setPin(@CurrentUser() user: any, @Body('pin') pin: string) {
    await this.usersService.setPin(user.userId, pin);
    return { message: 'Transaction PIN set successfully' };
  }
}
