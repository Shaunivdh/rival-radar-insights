'use server';

import { createElement, type ComponentProps } from 'react';
import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { sendEmail } from '@/services/email';
import ContactMessage from '@/emails/ContactMessage';
import { isRateLimited } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Public forms: a handful of sends per visitor per hour is plenty. */
const FORM_RATE = { limit: 5, windowMs: 60 * 60_000 };
const RATE_LIMITED_ERROR = 'Too many requests. Please try again in a little while.';

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

/** Visitor IP for rate limiting signed out forms (same source as /api/crawl). */
async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export type ContactResult = { ok: true } | { ok: false; error: string };

/** Rate limit, then email the support inbox with replies going to the visitor. */
async function emailSupport(
  form: 'contact' | 'beta-interest',
  subject: string,
  props: ComponentProps<typeof ContactMessage>,
  errors: { unavailable: string; failed: string },
): Promise<ContactResult> {
  if (!SUPPORT_EMAIL) {
    logger.error('contact', 'SUPPORT_EMAIL is not configured');
    return { ok: false, error: errors.unavailable };
  }
  if (await isRateLimited(`${form}:${await getClientIp()}`, FORM_RATE)) {
    return { ok: false, error: RATE_LIMITED_ERROR };
  }

  try {
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject,
      replyTo: props.fromEmail,
      react: createElement(ContactMessage, props),
    });
    return { ok: true };
  } catch (err) {
    logger.error('contact', `${form} send failed`, { error: err });
    return { ok: false, error: errors.failed };
  }
}

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

  const user = await getSessionUser();

  return emailSupport(
    'contact',
    `[Contact] ${subject}`,
    { fromEmail: email, subject, message, accountEmail: user?.email, userId: user?.id },
    {
      unavailable: 'We could not send your message. Please try again later.',
      failed: 'Something went wrong sending your message. Please try again.',
    },
  );
}

/** Beta waitlist: emails the support inbox, no DB table while the beta is invite only. */
export async function registerBetaInterest(input: {
  email: string;
  businessName: string;
  website: string;
}): Promise<ContactResult> {
  const email = input.email.trim().slice(0, 254);
  const businessName = input.businessName.trim().slice(0, 120);
  const website = input.website.trim().slice(0, 254);

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!businessName || !website) {
    return { ok: false, error: 'Please add your business name and website.' };
  }

  return emailSupport(
    'beta-interest',
    `[Beta] ${businessName}`,
    {
      fromEmail: email,
      subject: 'Beta interest',
      message: `Business: ${businessName}\nWebsite: ${website}`,
    },
    {
      unavailable: 'We could not register your interest. Please try again later.',
      failed: 'Something went wrong. Please try again.',
    },
  );
}
