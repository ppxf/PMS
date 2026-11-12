import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { WorkspaceService } from './workspace.service';
type UserRequest = Request & { user: AuthUser };
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}
  @Get('projects') projects(@Req() r: UserRequest) {
    return this.workspace.projects(r.user.id);
  }
  @Get('issues') issues(
    @Req() r: UserRequest,
    @Query() q: Record<string, unknown>,
  ) {
    return this.workspace.issues(r.user.id, q);
  }
  @Get('ingestion') ingestion(
    @Req() r: UserRequest,
    @Query() q: Record<string, unknown>,
  ) {
    return this.workspace.ingestion(r.user.id, q);
  }
  @Get('alert-rules') rules(
    @Req() r: UserRequest,
    @Query() q: Record<string, unknown>,
  ) {
    return this.workspace.rules(r.user.id, q);
  }
  @Post('alert-rules') createRule(
    @Req() r: UserRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.workspace.createRule(r.user.id, b);
  }
  @Patch('alert-rules/:id') updateRule(
    @Req() r: UserRequest,
    @Param('id') id: string,
    @Body() b: Record<string, unknown>,
  ) {
    return this.workspace.updateRule(r.user.id, id, b);
  }
  @Get('alerts') alerts(
    @Req() r: UserRequest,
    @Query() q: Record<string, unknown>,
  ) {
    return this.workspace.alerts(r.user.id, q);
  }
  @Post('alerts/:id/acknowledge') acknowledge(
    @Req() r: UserRequest,
    @Param('id') id: string,
  ) {
    return this.workspace.acknowledge(r.user.id, id);
  }
}
