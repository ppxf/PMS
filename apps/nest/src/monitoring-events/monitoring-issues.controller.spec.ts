import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { MonitoringIssuesController } from './monitoring-issues.controller';

describe('MonitoringIssuesController', () => {
  const events = {
    listOwnedIssues: jest.fn(),
    getOwnedIssue: jest.fn(),
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

  it('forwards the issue id within the authenticated project scope', async () => {
    events.getOwnedIssue.mockResolvedValue({ id: 'issue-id' });
    await controller.detail(request as never, 'acme', 'web', 'issue-id');
    expect(events.getOwnedIssue).toHaveBeenCalledWith(
      'user-1', 'acme', 'web', 'issue-id',
    );
  });

  it.each([
    [{}, 1, 20, 0],
    [{ page: '2', pageSize: '50' }, 2, 50, 0],
    [{ page: '0' }, 0, 20, 1],
    [{ pageSize: '25' }, 1, 25, 1],
  ])('transforms and validates pagination %p', (input, page, pageSize, errors) => {
    const query = plainToInstance(ListIssuesQueryDto, input);
    expect(query).toMatchObject({ page, pageSize });
    expect(validateSync(query)).toHaveLength(errors);
  });
});
