'use server';

import { createElement } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { sendEmail } from '@/services/email';
import ContactMessage from '@/emails/ContactMessage';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Session user, if any. Contact is open to signed out visitors too. */
async function getSessionUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? undefined } : null;
  } catch {
    return null;
  }
}

export type ContactResult = { ok: true } | { ok: false; error: string };

export async function sendContactMessage(input: {
  email: string;
  subject: string;
  message: string;
}): Promise<ContactResult> {
  const email = input.email.trim().slice(0, 254);
  const subject = input.subject.trim().slice(0, 120);
  const message = input.message.trim().slice(0, 2000);

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address so we can reply.' };
  }
  if (!subject || !message) {
    return { ok: false, error: 'Please add a subject and a message.' };
  }
  if (!SUPPORT_EMAIL) {
    console.error('[contact] SUPPORT_EMAIL is not configured');
    return { ok: false, error: 'We could not send your message. Please try again later.' };
  }

  const user = await getSessionUser();

  try {
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[Contact] ${subject}`,
      react: createElement(ContactMessage, {
        fromEmail: email,
        subject,
        message,
        accountEmail: user?.email,
        userId: user?.id,
      }),
    });
    return { ok: true };
  } catch (err) {
    console.error('[contact] send failed', err);
    return { ok: false, error: 'Something went wrong sending your message. Please try again.' };
  }
}
