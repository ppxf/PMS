import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { MonitoringIssuesController } from './monitoring-issues.controller';
import { MonitoringErrorIssueStatus } from './entities/monitoring-error-issue.entity';

describe('MonitoringIssuesController', () => {
  const events = {
    listOwnedIssues: jest.fn(),
    getOwnedIssue: jest.fn(),
    updateOwnedIssueStatus: jest.fn(),
  };
  const controller = new MonitoringIssuesController(events as never);
  const request = { user: { id: 'user-1', email: 'owner@example.com' } };

  beforeEach(() => jest.clearAllMocks());

  it('forwards the authenticated owner and bounded pagination to the service', async () => {
    events.listOwnedIssues.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 50 });
    await expect(
      controller.list(request as never, 'acme', 'web', { page: 2, pageSize: 50 }),
    ).resolves.toEqual({ items: [], total: 0, page: 2, pageSize: 50 });
    expect(events.listOwnedIssues).toHaveBeenCalledWith(
      'user-1', 'acme', 'web', { page: 2, pageSize: 50 },
    );
  });

  it('forwards manual status changes within the authenticated project scope', async () => {
    events.updateOwnedIssueStatus.mockResolvedValue({ status: 'resolved' });
    await controller.updateStatus(
      request as never,
      'acme',
      'web',
      'issue-id',
      { status: MonitoringErrorIssueStatus.Resolved },
    );
    expect(events.updateOwnedIssueStatus).toHaveBeenCalledWith(
      'user-1', 'acme', 'web', 'issue-id', 'resolved',
    );
  });

  it('forwards the issue id within the authenticated project scope', async () => {
    events.getOwnedIssue.mockResolvedValue({ id: 'issue-id' });
    await controller.detail(request as never, 'acme', 'web', 'issue-id');
    expect(events.getOwnedIssue).toHaveBeenCalledWith(
      'user-1', 'acme', 'web', 'issue-id',
    );
  });

  it.each([
    [{}, 1, 20, undefined, 0],
    [{ page: '2', pageSize: '50', search: '  vue error  ' }, 2, 50, 'vue error', 0],
    [{ page: '0' }, 0, 20, undefined, 1],
    [{ pageSize: '25' }, 1, 25, undefined, 1],
  ])('transforms and validates issue list query %p', (input, page, pageSize, search, errors) => {
    const query = plainToInstance(ListIssuesQueryDto, input);
    expect(query).toMatchObject({ page, pageSize, ...(search === undefined ? {} : { search }) });
    expect(validateSync(query)).toHaveLength(errors);
  });
});
