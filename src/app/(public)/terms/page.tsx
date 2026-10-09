import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/LegalPage';
import { LEGAL_ADDRESS, LEGAL_ENTITY_NAME, legalContactEmail } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service | Scoutly',
  description: 'The terms that apply when you use Scoutly.',
};

export default function TermsPage() {
  const email = legalContactEmail();

  return (
    <LegalPage title="Terms of Service">
      <section>
        <h2>About these terms</h2>
        <p>
          These terms apply when you use Scoutly, a service run by {LEGAL_ENTITY_NAME}
          {LEGAL_ADDRESS ? ` of ${LEGAL_ADDRESS}` : ''} in the United Kingdom. By creating an
          account you agree to them. Our <Link href="/privacy">Privacy Policy</Link> explains how we
          handle your data.
        </p>
      </section>

      <section>
        <h2>Who can use Scoutly</h2>
        <p>
          Scoutly is for business use. You must be at least 18 and have authority to act for the
          business you add. You are responsible for keeping your login details safe and for
          everything done through your account.
        </p>
      </section>

      <section>
        <h2>What Scoutly does</h2>
        <p>
          Scoutly scans publicly available information about your business and the competitors you
          choose, scores them, and suggests priority actions. We aim to keep the service available
          and accurate, but we may change, improve or remove features over time.
        </p>
      </section>

      <section>
        <h2>Scores, AI and recommendations</h2>
        <p>
          Scores and recommendations are produced from third party data and AI analysis. They are
          guidance to help you decide what to do, not guarantees of results, rankings or revenue.
          Data from websites, Google, review sites and AI tools can be incomplete, out of date or
          wrong, so check anything important before relying on it.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>use Scoutly for anything unlawful, or to harass or defame anyone</li>
          <li>add websites you have no legitimate business reason to monitor</li>
          <li>try to break, overload, scrape or reverse engineer the service</li>
          <li>share your account or resell access without our written agreement</li>
        </ul>
        <p>We may suspend or close accounts that break these rules.</p>
      </section>

      <section>
        <h2>Fees</h2>
        {/* TODO(legal): replace with plan, billing cycle, renewal, cancellation and refund terms before taking payments. */}
        <p>
          Scoutly is currently free while in early access. If we introduce paid plans, we will tell
          you the price before you are charged and you can choose whether to continue.
        </p>
      </section>

      <section>
        <h2>Your content and ours</h2>
        <p>
          You keep ownership of the information you give us and allow us to use it to run the
          service. We own Scoutly, its software, design and reports format. You may use the reports
          we produce for your own business.
        </p>
      </section>

      <section>
        <h2>Ending your account</h2>
        <p>
          You can delete your account at any time from <Link href="/settings">Settings</Link>, which
          permanently removes your data. We may end or suspend the service with reasonable notice,
          or immediately if you seriously break these terms.
        </p>
      </section>

      <section>
        <h2>Our liability</h2>
        {/* TODO(legal): have a solicitor review this section, and set a cap once paid plans exist. */}
        <p>
          Nothing in these terms limits liability that cannot legally be limited, such as for death
          or personal injury caused by negligence, or for fraud.
        </p>
        <p>
          Otherwise, Scoutly is provided as is. We are not liable for loss of profit, revenue,
          business or data, or for any indirect loss, and our total liability to you is limited to
          the amount you have paid us in the 12 months before the claim.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>
          We may update these terms. If a change is significant, we will tell you by email or in the
          app before it takes effect. Continuing to use Scoutly afterwards means you accept the new
          terms.
        </p>
      </section>

      <section>
        <h2>Law and contact</h2>
        <p>
          These terms are governed by the law of England and Wales, and the courts of England and
          Wales have jurisdiction. Questions? Email <a href={`mailto:${email}`}>{email}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
