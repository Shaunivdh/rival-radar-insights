import { Html, Head, Body, Container, Section, Heading, Text, Hr } from '@react-email/components';

interface Props {
  fromEmail: string;
  subject: string;
  message: string;
  accountEmail?: string;
  userId?: string;
}

const styles = {
  body: { backgroundColor: '#f5f5f5', margin: 0, padding: 0 } as React.CSSProperties,
  container: { maxWidth: 600, margin: '0 auto', padding: '24px' } as React.CSSProperties,
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    fontFamily: 'Inter, Helvetica, Arial, sans-serif',
  } as React.CSSProperties,
  title: { fontSize: 20, color: '#111', margin: '0 0 4px' } as React.CSSProperties,
  meta: { color: '#555', fontSize: 13, margin: '2px 0' } as React.CSSProperties,
  hr: { borderColor: '#e5e7eb', margin: '20px 0' } as React.CSSProperties,
  message: {
    color: '#111',
    fontSize: 14,
    lineHeight: '22px',
    margin: 0,
    whiteSpace: 'pre-wrap',
  } as React.CSSProperties,
};

export default function ContactMessage({
  fromEmail,
  subject,
  message,
  accountEmail,
  userId,
}: Props) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.card}>
            <Heading style={styles.title}>{subject}</Heading>
            <Text style={styles.meta}>Reply to: {fromEmail}</Text>
            {accountEmail && accountEmail !== fromEmail && (
              <Text style={styles.meta}>Signed in as: {accountEmail}</Text>
            )}
            {userId && <Text style={styles.meta}>User ID: {userId}</Text>}
            <Hr style={styles.hr} />
            <Text style={styles.message}>{message}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
