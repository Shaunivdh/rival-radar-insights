import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import {
  BACKUP_RETENTION_DAYS,
  ICO_REGISTRATION_NUMBER,
  LEGAL_ADDRESS,
  LEGAL_ENTITY_NAME,
  legalContactEmail,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | Scoutly',
  description: 'How Scoutly collects, uses and protects your personal data.',
};

export default function PrivacyPage() {
  const email = legalContactEmail();

  return (
    <LegalPage title="Privacy Policy">
      <section>
        <h2>Who we are</h2>
        <p>
          Scoutly is a local competitor intelligence service run by {LEGAL_ENTITY_NAME} in the
          United Kingdom. We are the data controller for the personal data described in this policy.
        </p>
        <ul>
          <li>
            Email: <a href={`mailto:${email}`}>{email}</a>
          </li>
          {LEGAL_ADDRESS && <li>Address: {LEGAL_ADDRESS}</li>}
          {ICO_REGISTRATION_NUMBER && <li>ICO registration number: {ICO_REGISTRATION_NUMBER}</li>}
        </ul>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address and password. Passwords are
            stored as a secure hash; we never see them.
          </li>
          <li>
            <strong>Business details you give us:</strong> your business name, website, category,
            town and postcode, and the websites of the competitors you choose to track.
          </li>
          <li>
            <strong>Results we generate for you:</strong> scores, change alerts and priority
            actions.
          </li>
          <li>
            <strong>Messages and beta sign ups:</strong> anything you send through our contact or
            beta interest forms, including your email address, business name and website.
          </li>
          <li>
            <strong>Technical data:</strong> login session cookies and basic server logs (such as IP
            address and request times) kept for security and fault finding.
          </li>
        </ul>
        <p>We do not use advertising trackers or sell your data.</p>
      </section>

      <section>
        <h2>Public business information we collect</h2>
        <p>
          To produce reports, we collect publicly available information about the businesses our
          users track: website content, Google Business Profile details, reviews, search results and
          page speed data. This is business information, but it can occasionally include personal
          data, for example the name of a sole trader or a reviewer.
        </p>
        <p>
          We process this under our legitimate interest in providing competitor insight, we only use
          what is already public, and we do not build profiles of individuals. If your business
          appears in Scoutly and you want us to stop processing information about it, email us and
          we will act on it.
        </p>
      </section>

      <section>
        <h2>Why we use your data and our lawful basis</h2>
        <ul>
          <li>
            <strong>To provide the service you signed up for</strong> (performance of a contract):
            creating your account, scanning websites, scoring and producing your action plan.
          </li>
          <li>
            <strong>To keep Scoutly secure and working</strong> (legitimate interests): rate
            limiting, preventing abuse and fixing faults.
          </li>
          <li>
            <strong>To send service emails</strong> (performance of a contract): account
            confirmation, password resets and replies to your messages.
          </li>
          <li>
            <strong>To meet legal obligations</strong> (legal obligation): for example keeping
            records if we are required to by law.
          </li>
        </ul>
        <p>
          We will only send marketing emails if you have opted in, and you can unsubscribe at any
          time.
        </p>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <p>
          We use trusted service providers who process data on our behalf, under contracts that
          require them to protect it:
        </p>
        <ul>
          <li>
            <strong>Supabase:</strong> database and account login
          </li>
          <li>
            <strong>Vercel:</strong> website hosting
          </li>
          <li>
            <strong>Inngest:</strong> background job scheduling
          </li>
          <li>
            <strong>Cloudflare:</strong> loading the websites we scan
          </li>
          <li>
            <strong>Anthropic:</strong> AI analysis of business information and AI visibility checks
          </li>
          <li>
            <strong>SerpApi:</strong> search ranking results
          </li>
          <li>
            <strong>Google:</strong> business profile, review and page speed data
          </li>
          <li>
            <strong>Resend:</strong> sending emails
          </li>
        </ul>
        {/* TODO(legal): add the payments provider (e.g. Stripe) before taking payments. */}
        <p>
          We send business information, not your account details, to the AI and data providers. We
          may also disclose data if required by law.
        </p>
      </section>

      <section>
        <h2>International transfers</h2>
        <p>
          Some of these providers process data outside the UK, mainly in the United States. Where
          they do, the transfer is protected by the UK Extension to the EU US Data Privacy Framework
          or the UK International Data Transfer Addendum, as approved under UK law.
        </p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>Account and project data: for as long as your account is open.</li>
          <li>
            When you delete your account, we delete your data straight away. Copies in our database
            backups are overwritten within {BACKUP_RETENTION_DAYS} days.
          </li>
          <li>
            Contact and beta form messages: kept in our email inbox for as long as needed to deal
            with your enquiry or beta invitation.
          </li>
          <li>Server logs: kept for a short period for security, then deleted automatically.</li>
        </ul>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We only use cookies that are strictly necessary for Scoutly to work: keeping you signed
          in, remembering when you are viewing the demo, and site access checks. Because they are
          essential, we do not ask for consent to them. We do not use analytics or advertising
          cookies.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>Under UK data protection law you have the right to:</p>
        <ul>
          <li>access a copy of your data</li>
          <li>correct data that is wrong</li>
          <li>have your data deleted</li>
          <li>restrict or object to how we use it</li>
          <li>receive your data in a portable format</li>
        </ul>
        <p>
          You can export or delete your data yourself at any time from{' '}
          <Link href="/settings">Settings</Link>. For anything else, email{' '}
          <a href={`mailto:${email}`}>{email}</a> and we will reply within one month.
        </p>
        <p>
          If you are unhappy with how we handle your data, you can complain to the Information
          Commissioner&apos;s Office at{' '}
          <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>. We would appreciate the
          chance to put things right first.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Data is encrypted in transit, access to our database is restricted, and API keys are kept
          on our servers only. No system is perfectly secure, but we take reasonable steps to
          protect your data and will tell you and the ICO about a serious breach where the law
          requires it.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          If we make significant changes, we will tell you by email or in the app before they take
          effect. The date at the top shows when this policy was last updated.
        </p>
      </section>
    </LegalPage>
  );
}
