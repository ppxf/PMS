import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import {
  AuthTokensService,
  AuthTokenType,
} from '../auth-tokens/auth-tokens.service';
import { MailService } from '../mail/mail.service';
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
    private readonly tokens: AuthTokensService,
    private readonly mail: MailService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async register(input: {
    name: string;
    email: string;
    password: string;
    passwordConfirmation: string;
  }): Promise<{ message: string }> {
    this.assertPasswordsMatch(input.password, input.passwordConfirmation);
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email))
      throw new ConflictException('该邮箱已注册');
    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await this.users.createPendingUser(
          {
            name: input.name.trim(),
            email,
            passwordHash: await bcrypt.hash(input.password, 12),
          },
          manager,
        );
        const token = await this.tokens.create(
          user.id,
          AuthTokenType.EmailVerification,
          this.config.get<number>(
            'auth.emailVerificationExpiresInMinutes',
            1440,
          ),
          manager,
        );
        await this.mail.sendEmailVerification(email, token);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('该邮箱已注册');
      throw new ServiceUnavailableException('暂时无法发送验证邮件，请稍后重试');
    }
    return { message: '注册成功，请查收验证邮件' };
  }

  async verifyEmail(tokenValue: string): Promise<{ message: string }> {
    await this.dataSource.transaction(async (manager) => {
      const token = await this.tokens.findValid(
        tokenValue,
        AuthTokenType.EmailVerification,
        manager,
      );
      if (!token || token.user.status !== UserStatus.PendingVerification) {
        throw new BadRequestException('验证链接无效或已过期');
      }
      await this.users.activate(token.userId, manager);
      await this.tokens.consumeAll(
        token.userId,
        AuthTokenType.EmailVerification,
        manager,
      );
    });
    return { message: '邮箱验证成功' };
  }

  async resendVerification(emailInput: string): Promise<{ message: string }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (user?.status === UserStatus.PendingVerification) {
      try {
        const token = await this.tokens.create(
          user.id,
          AuthTokenType.EmailVerification,
          this.config.get<number>(
            'auth.emailVerificationExpiresInMinutes',
            1440,
          ),
        );
        await this.mail.sendEmailVerification(email, token);
      } catch {
        throw new ServiceUnavailableException(
          '暂时无法发送验证邮件，请稍后重试',
        );
      }
    }
    return { message: '如果该邮箱需要验证，我们将发送验证邮件' };
  }

  async forgotPassword(emailInput: string): Promise<{ message: string }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (user?.status === UserStatus.Active) {
      try {
        const token = await this.tokens.create(
          user.id,
          AuthTokenType.PasswordReset,
          this.config.get<number>('auth.passwordResetExpiresInMinutes', 30),
        );
        await this.mail.sendPasswordReset(email, token);
      } catch {
        throw new ServiceUnavailableException(
          '暂时无法发送重置邮件，请稍后重试',
        );
      }
    }
    return { message: '如果该邮箱已注册，我们将发送重置邮件' };
  }

  async resetPassword(input: {
    token: string;
    password: string;
    passwordConfirmation: string;
  }): Promise<{ message: string }> {
    this.assertPasswordsMatch(input.password, input.passwordConfirmation);
    await this.dataSource.transaction(async (manager) => {
      const token = await this.tokens.findValid(
        input.token,
        AuthTokenType.PasswordReset,
        manager,
      );
      if (!token || token.user.status !== UserStatus.Active) {
        throw new BadRequestException('重置链接无效或已过期');
      }
      await this.users.updatePassword(
        token.userId,
        await bcrypt.hash(input.password, 12),
        manager,
      );
      await this.tokens.consumeAll(
        token.userId,
        AuthTokenType.PasswordReset,
        manager,
      );
    });
    return { message: '密码重置成功' };
  }

  private assertPasswordsMatch(password: string, confirmation: string): void {
    if (password !== confirmation)
      throw new BadRequestException('两次输入的密码不一致');
  }

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
