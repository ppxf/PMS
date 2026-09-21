import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthSession, AuthUser, CurrentUserResponse } from './interfaces/auth-user.interface';

interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '账号登录' })
  login(@Body() dto: LoginDto): Promise<AuthSession> {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录用户' })
  me(@Req() request: AuthenticatedRequest): Promise<CurrentUserResponse> {
    return this.auth.getCurrentUser(request.user.id);
  }
}
