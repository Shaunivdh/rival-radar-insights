/**
 * sendContactMessage validation and failure paths.
 *
 * SUPPORT_EMAIL is read at module scope, so each case sets the env then imports
 * the module fresh via vi.resetModules().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendEmail = vi.fn();

vi.mock('@/services/email', () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));

// tsconfig sets jsx: "preserve" for Next, so vitest cannot transform .tsx.
// The action only passes this component to createElement, so a stub is enough
// and keeps the rendered props assertable.
vi.mock('@/emails/ContactMessage', () => ({
  default: function ContactMessage() {
    return null;
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}));

let currentUser: { id: string; email?: string } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

async function loadAction(supportEmail: string | undefined) {
  vi.resetModules();
  if (supportEmail === undefined) delete process.env.SUPPORT_EMAIL;
  else process.env.SUPPORT_EMAIL = supportEmail;
  return (await import('@/actions/contact')).sendContactMessage;
}

const VALID = {
  email: 'owner@example.com',
  subject: 'Question',
  message: 'How is my score built?',
};

describe('sendContactMessage', () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ id: 'email-1' });
    currentUser = null;
  });

  it('sends to the support inbox and reports success', async () => {
    const send = await loadAction('support@scoutly.test');
    await expect(send(VALID)).resolves.toEqual({ ok: true });

    expect(sendEmail).toHaveBeenCalledOnce();
    const arg = sendEmail.mock.calls[0][0] as { to: string; subject: string };
    expect(arg.to).toBe('support@scoutly.test');
    expect(arg.subject).toBe('[Contact] Question');
  });

  it('attaches the signed-in account to the email when there is a session', async () => {
    currentUser = { id: 'user-123', email: 'account@example.com' };
    const send = await loadAction('support@scoutly.test');
    await send(VALID);

    const props = (sendEmail.mock.calls[0][0] as { react: { props: Record<string, unknown> } })
      .react.props;
    expect(props.accountEmail).toBe('account@example.com');
    expect(props.userId).toBe('user-123');
  });

  it.each(['not-an-email', 'missing@domain', 'no-at-sign.com', 'spaces in@example.com', ''])(
    'rejects the invalid address %j without sending',
    async (email) => {
      const send = await loadAction('support@scoutly.test');
      const result = await send({ ...VALID, email });

      expect(result.ok).toBe(false);
      expect(sendEmail).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty subject or message without sending', async () => {
    const send = await loadAction('support@scoutly.test');

    expect(await send({ ...VALID, subject: '   ' })).toEqual({
      ok: false,
      error: 'Please add a subject and a message.',
    });
    expect(await send({ ...VALID, message: '' })).toEqual({
      ok: false,
      error: 'Please add a subject and a message.',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('trims and caps subject at 120 and message at 2000 characters', async () => {
    const send = await loadAction('support@scoutly.test');
    await send({
      email: `  ${VALID.email}  `,
      subject: 'S'.repeat(200),
      message: 'M'.repeat(3000),
    });

    const arg = sendEmail.mock.calls[0][0] as {
      subject: string;
      react: { props: Record<string, string> };
    };
    expect(arg.subject).toBe(`[Contact] ${'S'.repeat(120)}`);
    expect(arg.react.props.message).toHaveLength(2000);
    expect(arg.react.props.fromEmail).toBe(VALID.email);
  });

  it('fails cleanly when SUPPORT_EMAIL is not configured', async () => {
    const send = await loadAction(undefined);
    const result = await send(VALID);

    expect(result).toEqual({
      ok: false,
      error: 'We could not send your message. Please try again later.',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('reports a friendly error when the email provider throws', async () => {
    sendEmail.mockRejectedValue(new Error('Email send failed: rate limited'));
    const send = await loadAction('support@scoutly.test');

    await expect(send(VALID)).resolves.toEqual({
      ok: false,
      error: 'Something went wrong sending your message. Please try again.',
    });
  });
});
