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
      'Verify your email',
      'Please verify your email',
      `/verify-email?token=${encodeURIComponent(token)}`,
    );
  }

  sendPasswordReset(email: string, token: string): Promise<unknown> {
    return this.send(
      email,
      'Reset your password',
      'Please reset your password',
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
      text: `${introduction}: ${url}`,
      html: `<p>${introduction}</p><p><a href="${url}">${url}</a></p>`,
    });
  }
}
