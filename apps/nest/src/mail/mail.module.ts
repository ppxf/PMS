import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MAIL_TRANSPORT } from './mail.constants';
import { MailService } from './mail.service';

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createTransport({
          host: config.getOrThrow<string>('mail.host'),
          connectionTimeout: 30000,
          greetingTimeout: 30000,
          socketTimeout: 60000,
          port: config.getOrThrow<number>('mail.port'),
          secure: config.get<boolean>('mail.secure', false),
          auth: config.get<string>('mail.user')
            ? {
                user: config.getOrThrow<string>('mail.user'),
                pass: config.getOrThrow<string>('mail.password'),
              }
            : undefined,
        }),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
