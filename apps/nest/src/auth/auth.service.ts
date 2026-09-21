import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  AuthSession,
  CurrentUserResponse,
} from './interfaces/auth-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const INVALID_CREDENTIALS = '邮箱或密码错误';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const user = await this.users.findByEmail(email);
    if (
      !user ||
      user.status !== UserStatus.Active ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      ...this.toCurrentUser(user),
    };
  }

  async getCurrentUser(id: string): Promise<CurrentUserResponse> {
    const user = await this.users.findActiveById(id);
    if (!user) throw new UnauthorizedException();
    return this.toCurrentUser(user);
  }

  private toCurrentUser(user: User): CurrentUserResponse {
    return {
      user: { id: user.id, name: user.name, email: user.email },
      permissions: [...user.permissions],
    };
  }
}
