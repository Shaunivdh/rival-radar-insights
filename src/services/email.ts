import type { ReactElement } from 'react';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: ReactElement;
}) {
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, react });
  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}
