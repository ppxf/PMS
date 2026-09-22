import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { MAIL_TRANSPORT } from './mail.constants';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    private readonly config: ConfigService,
  ) {}

  sendEmailVerification(email: string, token: string): Promise<unknown> {
    return this.send(
      email,
      '验证您的邮箱',
      '请验证您的邮箱',
      `/verify-email?token=${encodeURIComponent(token)}`,
    );
  }

  sendPasswordReset(email: string, token: string): Promise<unknown> {
    return this.send(
      email,
      '重置您的密码',
      '请重置您的密码',
      `/reset-password?token=${encodeURIComponent(token)}`,
    );
  }

  private send(
    to: string,
    subject: string,
    introduction: string,
    path: string,
  ): Promise<unknown> {
    const baseUrl = this.config
      .getOrThrow<string>('app.frontendUrl')
      .replace(/\/$/, '');
    const url = `${baseUrl}${path}`;
    return this.transport.sendMail({
      from: this.config.getOrThrow<string>('mail.from'),
      to,
      subject,
      text: `${introduction}：${url}`,
      html: `<p>${introduction}</p><p><a href="${url}">${url}</a></p>`,
    });
  }
}
