import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
  Row,
  Column,
  Font,
} from '@react-email/components';
import type { AIHealthScore, PriorityAction } from '@/types';

interface Props {
  businessName: string;
  scores: Pick<AIHealthScore, 'reputationScore' | 'localVisibilityScore' | 'websiteHealthScore'>;
  topAction: Pick<PriorityAction, 'action' | 'reason'>;
  changes: { competitor: string; change: string }[];
  dashboardUrl: string;
}

const SCORE_LABELS: {
  label: string;
  key: keyof Pick<AIHealthScore, 'reputationScore' | 'localVisibilityScore' | 'websiteHealthScore'>;
}[] = [
  { label: 'Reputation', key: 'reputationScore' },
  { label: 'Local SEO', key: 'localVisibilityScore' },
  { label: 'Website', key: 'websiteHealthScore' },
];

const styles = {
  body: { backgroundColor: '#f5f5f5', margin: 0, padding: 0 } as React.CSSProperties,
  header: { backgroundColor: '#5B4EE8', padding: '24px 0' } as React.CSSProperties,
  headerContainer: { maxWidth: 600, margin: '0 auto', padding: '0 24px' } as React.CSSProperties,
  headerTitle: {
    color: '#ffffff',
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
  } as React.CSSProperties,
  headerSubtitle: { color: '#c4beff', margin: '4px 0 0', fontSize: 13 } as React.CSSProperties,
  mainContainer: { maxWidth: 600, margin: '0 auto', padding: '0 24px' } as React.CSSProperties,
  greeting: { padding: '32px 0 0' } as React.CSSProperties,
  greetingTitle: { fontSize: 20, color: '#111', margin: '0 0 8px' } as React.CSSProperties,
  greetingText: { color: '#555', fontSize: 14, margin: 0 } as React.CSSProperties,
  hr: { borderColor: '#e5e7eb', margin: '24px 0' } as React.CSSProperties,
  sectionLabel: {
    fontSize: 14,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    margin: '0 0 16px',
  },
  scoreColumn: {
    textAlign: 'center' as const,
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: 8,
    margin: '0 4px',
    border: '1px solid #e5e7eb',
  },
  scoreValue: { fontSize: 28, fontWeight: 700, color: '#5B4EE8', margin: 0 } as React.CSSProperties,
  scoreLabel: { fontSize: 12, color: '#888', margin: '4px 0 0' } as React.CSSProperties,
  changeRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    padding: '12px 16px',
    marginBottom: 8,
  } as React.CSSProperties,
  changeName: { fontWeight: 600, color: '#111', fontSize: 14, margin: 0 } as React.CSSProperties,
  changeText: { color: '#555', fontSize: 13, margin: '4px 0 0' } as React.CSSProperties,
  priorityBox: {
    backgroundColor: '#f0eeff',
    borderRadius: 8,
    padding: '20px',
    border: '1px solid #d4ccff',
  } as React.CSSProperties,
  priorityLabel: {
    fontSize: 13,
    color: '#5B4EE8',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    margin: '0 0 8px',
  },
  priorityText: { color: '#111', fontSize: 14, margin: 0 } as React.CSSProperties,
  ctaSection: { textAlign: 'center' as const, padding: '32px 0' },
  ctaButton: {
    backgroundColor: '#5B4EE8',
    color: '#fff',
    padding: '12px 28px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  } as React.CSSProperties,
  footer: { padding: '16px 0 32px' } as React.CSSProperties,
  footerText: { color: '#aaa', fontSize: 12, textAlign: 'center' as const, margin: 0 },
  footerLink: { color: '#aaa' } as React.CSSProperties,
};

export default function WeeklyDigest({
  businessName,
  scores,
  topAction,
  changes,
  dashboardUrl,
}: Props) {
  return (
    <Html>
      <Head>
        {/* Inter v13 — pinned URL; update if Google Fonts changes the path */}
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Body style={styles.body}>
        <Section style={styles.header}>
          <Container style={styles.headerContainer}>
            <Heading style={styles.headerTitle}>RivalRadar</Heading>
            <Text style={styles.headerSubtitle}>Your weekly competitor radar</Text>
          </Container>
        </Section>

        <Container style={styles.mainContainer}>
          <Section style={styles.greeting}>
            <Heading as="h2" style={styles.greetingTitle}>
              Weekly Report for {businessName}
            </Heading>
            <Text style={styles.greetingText}>
              Here's what changed in your competitive landscape this week.
            </Text>
          </Section>

          <Hr style={styles.hr} />

          <Section>
            <Heading as="h3" style={styles.sectionLabel}>
              Your Scores
            </Heading>
            <Row>
              {SCORE_LABELS.map(({ label, key }) => (
                <Column key={key} style={styles.scoreColumn}>
                  <Text style={styles.scoreValue}>{scores[key]}</Text>
                  <Text style={styles.scoreLabel}>{label}</Text>
                </Column>
              ))}
            </Row>
          </Section>

          <Hr style={styles.hr} />

          {changes.length > 0 && (
            <Section>
              <Heading as="h3" style={styles.sectionLabel}>
                Competitor Activity
              </Heading>
              {changes.map(({ competitor, change }) => (
                <Row key={competitor} style={styles.changeRow}>
                  <Column>
                    <Text style={styles.changeName}>{competitor}</Text>
                    <Text style={styles.changeText}>{change}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          <Hr style={styles.hr} />

          <Section style={styles.priorityBox}>
            <Heading as="h3" style={styles.priorityLabel}>
              Top Priority This Week
            </Heading>
            <Text style={styles.priorityText}>{topAction.action}</Text>
            <Text style={styles.changeText}>{topAction.reason}</Text>
          </Section>

          <Section style={styles.ctaSection}>
            <Button href={dashboardUrl} style={styles.ctaButton}>
              View Full Report
            </Button>
          </Section>

          <Hr style={styles.hr} />
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              RivalRadar · You're receiving this because you signed up for weekly reports.
              <br />
              <a href="#" style={styles.footerLink}>
                Unsubscribe
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
