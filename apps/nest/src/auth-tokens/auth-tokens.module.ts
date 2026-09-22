import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthTokensService } from './auth-tokens.service';
import { AuthToken } from './entities/auth-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuthToken])],
  providers: [AuthTokensService],
  exports: [AuthTokensService],
})
export class AuthTokensModule {}
