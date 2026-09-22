import type { ReactElement } from 'react';
import { Resend } from 'resend';

const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

let resend: Resend | null = null;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  return (resend ??= new Resend(key));
}

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: ReactElement;
}) {
  const { data, error } = await getResend().emails.send({ from: FROM, to, subject, react });
  if (error) throw new Error(`Email send failed: ${error.message}`);
  return data;
}
