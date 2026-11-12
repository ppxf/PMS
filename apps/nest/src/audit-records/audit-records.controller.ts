import { Controller, Get, Query, Req } from '@nestjs/common';
import { AuditRecordsService } from './audit-records.service';
@Controller('audit-records')
export class AuditRecordsController {
  constructor(private readonly audit: AuditRecordsService) {}
  @Get('capabilities') capabilities(@Req() req: { user: { id: string } }) {
    return this.audit.capabilities(req.user.id);
  }
  @Get() list(
    @Req() req: { user: { id: string } },
    @Query() query: Record<string, unknown>,
  ) {
    return this.audit.list(req.user.id, query);
  }
}
