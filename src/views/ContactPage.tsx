'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Mail, Send, CheckCircle2, MessageCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRivalRadarStore } from '@/store/rivalradar';
import { sendContactMessage } from '@/actions/contact';

const ContactPage = () => {
  const { toast } = useToast();
  const { user } = useRivalRadarStore();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const email = emailInput ?? user?.email ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !subject.trim() || !message.trim() || sending) return;

    setSending(true);
    const result = await sendContactMessage({ email, subject, message });
    setSending(false);

    if (!result.ok) {
      toast({ title: 'Message not sent', description: result.error, variant: 'destructive' });
      return;
    }

    setSent(true);
    toast({
      title: 'Message sent',
      description: 'We usually reply within 2 hours on weekdays.',
    });
  };

  const reset = () => {
    setSent(false);
    setSubject('');
    setMessage('');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-greeting p-8 lg:p-12 mb-8 text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card mb-4"
          style={{ boxShadow: 'var(--neu-shadow)' }}
        >
          <MessageCircle className="w-7 h-7 text-primary" />
        </div>
        <h1 className="font-display text-3xl lg:text-4xl font-bold mb-3">Contact us</h1>
        <p className="text-muted-foreground mb-2 max-w-md mx-auto">
          Got a question about your score, your competitors, or your account? Send us a note and we
          will get back to you quickly.
        </p>
        <p className="text-xs text-muted-foreground">
          We usually reply within 2 hours on weekdays.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        {sent ? (
          <Card className="border-0 text-center py-10" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardContent className="pt-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-score-excellent/10 mb-4">
                <CheckCircle2 className="w-7 h-7 text-score-excellent" />
              </div>
              <h2 className="font-display text-2xl font-bold mb-2">Thanks, we have got it</h2>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                Your message is on its way to the Scoutly team. Keep an eye on your inbox, we will
                be in touch shortly.
              </p>
              <Button variant="outline" onClick={reset}>
                Send another message
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Send a message</CardTitle>
                  <CardDescription className="text-xs">
                    Tell us what is going on and we will help you out
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs">
                    Your email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@yourbusiness.co.uk"
                    required
                    maxLength={254}
                    disabled={sending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-xs">
                    Subject
                  </Label>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What is it about?"
                    required
                    maxLength={120}
                    disabled={sending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="msg" className="text-xs">
                    Message
                  </Label>
                  <Textarea
                    id="msg"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what is going on..."
                    rows={5}
                    required
                    maxLength={2000}
                    disabled={sending}
                  />
                  <p className="text-[11px] text-muted-foreground text-right">
                    {message.length}/2000
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={sending}
                  className="w-full gap-2 bg-primary text-white hover:bg-primary/90"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Send message
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </motion.div>
  );
};

export default ContactPage;
