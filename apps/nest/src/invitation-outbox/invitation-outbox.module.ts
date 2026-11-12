import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { InvitationOutbox } from './invitation-outbox.entity';
import { InvitationOutboxService } from './invitation-outbox.service';
@Module({
  imports: [TypeOrmModule.forFeature([InvitationOutbox]), MailModule],
  providers: [InvitationOutboxService],
  exports: [InvitationOutboxService],
})
export class InvitationOutboxModule {}
