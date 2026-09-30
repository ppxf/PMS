import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ArchiveIssueDto } from './dto/archive-issue.dto';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { MonitoringIssuesController } from './monitoring-issues.controller';
import { MonitoringErrorIssueStatus } from './entities/monitoring-error-issue.entity';

describe('MonitoringIssuesController', () => {
  const events = {
    listOwnedIssues: jest.fn(),
    getOwnedIssue: jest.fn(),
    updateOwnedIssueStatus: jest.fn(),
    archiveOwnedIssue: jest.fn(),
    restoreOwnedIssue: jest.fn(),
    deleteOwnedIssue: jest.fn(),
    permanentlyDeleteOwnedIssue: jest.fn(),
  };
  const controller = new MonitoringIssuesController(events as never);
  const request = { user: { id: 'user-1', email: 'owner@example.com' } };

  beforeEach(() => jest.clearAllMocks());

  it('forwards the authenticated owner and bounded pagination to the service', async () => {
    events.listOwnedIssues.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 50 });
    await expect(
      controller.list(request as never, 'acme', 'web', {
        page: 2,
        pageSize: 50,
        view: 'active',
      }),
    ).resolves.toEqual({ items: [], total: 0, page: 2, pageSize: 50 });
    expect(events.listOwnedIssues).toHaveBeenCalledWith(
      'user-1', 'acme', 'web', { page: 2, pageSize: 50, view: 'active' },
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

  it('forwards archive, restore and delete operations within project scope', async () => {
    events.archiveOwnedIssue.mockResolvedValue({ visibility: 'archived_permanent' });
    await controller.archive(request as never, 'acme', 'web', 'issue-id', { mode: 'permanent' });
    await controller.restore(request as never, 'acme', 'web', 'issue-id');
    await controller.remove(request as never, 'acme', 'web', 'issue-id');
    await controller.permanentlyRemove(request as never, 'acme', 'web', 'issue-id');

    expect(events.archiveOwnedIssue).toHaveBeenCalledWith(
      'user-1', 'acme', 'web', 'issue-id', { mode: 'permanent' },
    );
    expect(events.restoreOwnedIssue).toHaveBeenCalledWith('user-1', 'acme', 'web', 'issue-id');
    expect(events.deleteOwnedIssue).toHaveBeenCalledWith('user-1', 'acme', 'web', 'issue-id');
    expect(events.permanentlyDeleteOwnedIssue).toHaveBeenCalledWith(
      'user-1', 'acme', 'web', 'issue-id',
    );
  });

  it.each([
    [{ mode: 'permanent' }, 0],
    [{ mode: 'until_count', threshold: 10 }, 0],
    [{ mode: 'until_count', threshold: 100 }, 0],
    [{ mode: 'until_count', threshold: 1000 }, 0],
    [{ mode: 'until_count' }, 1],
    [{ mode: 'permanent', threshold: 10 }, 1],
    [{ mode: 'until_count', threshold: 50 }, 1],
  ])('validates archive input %p', (input, errors) => {
    const dto = plainToInstance(ArchiveIssueDto, input);
    expect(validateSync(dto)).toHaveLength(errors);
  });

  it.each([
    [{}, 1, 20, undefined, 'active', 0],
    [{ page: '2', pageSize: '50', search: '  vue error  ', view: 'archived' }, 2, 50, 'vue error', 'archived', 0],
    [{ page: '0' }, 0, 20, undefined, 'active', 1],
    [{ pageSize: '25' }, 1, 25, undefined, 'active', 1],
    [{ view: 'all' }, 1, 20, undefined, 'all', 1],
  ])('transforms and validates issue list query %p', (input, page, pageSize, search, view, errors) => {
    const query = plainToInstance(ListIssuesQueryDto, input);
    expect(query).toMatchObject({ page, pageSize, view, ...(search === undefined ? {} : { search }) });
    expect(validateSync(query)).toHaveLength(errors);
  });
});
