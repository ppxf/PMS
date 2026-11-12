import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  overview(
    @Req() request: Request & { user: AuthUser },
    @Query('range') range?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.dashboard.overview(request.user.id, range, groupId);
  }
}
