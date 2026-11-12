import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('escapes invitation names and encodes the acceptance token', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    const service = new MailService(
      { sendMail } as never,
      new ConfigService({
        app: { frontendUrl: 'https://pms.example.com' },
        mail: { from: 'pms@example.com' },
      }),
    );
    await service.sendProjectInvitation(
      'member@example.com',
      'a+b/c',
      '<script>Project</script>',
      '"Inviter" & Co',
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.com',
        text: expect.stringContaining(
          '/project-invitations/accept?token=a%2Bb%2Fc',
        ),
        html: expect.stringContaining('&lt;script&gt;Project&lt;/script&gt;'),
      }),
    );
    expect(sendMail.mock.calls[0][0].html).not.toContain('<script>');
  });
  it.each([
    ['verification', 'sendEmailVerification', '/verify-email?token=a%2Bb%2Fc'],
    ['password reset', 'sendPasswordReset', '/reset-password?token=a%2Bb%2Fc'],
  ])('builds a complete %s email', async (_label, method, path) => {
    let message: Record<string, unknown> | undefined;
    const transport = {
      sendMail: (input: Record<string, unknown>) => {
        message = input;
        return Promise.resolve({ messageId: '1' });
      },
    };
    const service = new MailService(
      transport as never,
      new ConfigService({
        app: { frontendUrl: 'https://pms.example.com' },
        mail: { from: 'PMS <no-reply@example.com>' },
      }),
    );

    const send =
      service[method as 'sendEmailVerification' | 'sendPasswordReset'].bind(
        service,
      );
    await send('user@example.com', 'a+b/c');

    expect(message).toMatchObject({
      from: 'PMS <no-reply@example.com>',
      to: 'user@example.com',
    });
    expect(String(message?.text)).toContain(`https://pms.example.com${path}`);
    expect(String(message?.html)).toContain(`https://pms.example.com${path}`);
  });
});
