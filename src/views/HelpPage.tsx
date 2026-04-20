'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Search, BookOpen, Mail, Rocket,
  Eye, Users, Star, CreditCard, Shield, ArrowRight, Send,
  FileText, Lightbulb,
} from 'lucide-react';

const categories = [
  { icon: Rocket, label: 'Getting started', count: 8, color: 'text-primary', bg: 'bg-primary/10' },
  { icon: Eye, label: 'Understanding your score', count: 12, color: 'text-accent', bg: 'bg-accent/10' },
  { icon: Users, label: 'Competitors', count: 6, color: 'text-score-excellent', bg: 'bg-score-excellent/10' },
  { icon: Star, label: 'Reviews & replies', count: 9, color: 'text-score-average', bg: 'bg-score-average/10' },
  { icon: CreditCard, label: 'Billing', count: 5, color: 'text-muted-foreground', bg: 'bg-muted/60' },
  { icon: Shield, label: 'Account & security', count: 4, color: 'text-score-poor', bg: 'bg-score-poor/10' },
];

const faqs = [
  {
    q: 'How is my RivalRadar score calculated?',
    a: 'Your score is a 0–100 weighted average across 6 dimensions: SEO, Reviews, Trust signals, Local presence, Page experience, and Content. Each dimension is benchmarked against the top performers in your industry and city, so your score reflects how you stack up locally — not against the entire web.',
  },
  {
    q: 'How often does RivalRadar re-crawl my website?',
    a: 'We crawl your site once a week and pull fresh Google review data daily. You can trigger a manual re-crawl at any time from My Business → Refresh data.',
  },
  {
    q: 'Can I track more than 5 competitors?',
    a: 'The Pro plan tracks up to 5 competitors. We\'ve capped this on purpose — most local businesses only really compete with 3–5 rivals, and tracking more dilutes the focus of your action plan. Reach out if you need an enterprise quota.',
  },
  {
    q: 'Why don\'t I see reply timestamps on Google reviews?',
    a: 'Google\'s Places API doesn\'t return the date a business owner replied — only the review\'s original timestamp. We surface everything they do return: rating, body text, author, review date, and the reply text itself.',
  },
  {
    q: 'How do AI-suggested review replies work?',
    a: 'We generate a draft reply in your business\'s tone using the review\'s content + your historical replies as context. Drafts are starting points — always read and edit before posting to Google.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from Settings → Billing and you\'ll keep access until the end of your current billing period. We don\'t charge cancellation fees and we don\'t lock your data — you can export everything before you leave.',
  },
  {
    q: 'What happens if a competitor blocks crawling?',
    a: 'If a competitor\'s site blocks our crawler, we fall back to publicly available signals (Google Business profile, schema markup, public review data). You\'ll see a small note on their card if data is partial.',
  },
];

const guides = [
  { title: 'Set up your business in 5 minutes', time: '5 min read', icon: Rocket },
  { title: 'How to read your action plan', time: '8 min read', icon: Lightbulb },
  { title: 'Replying to negative reviews — a playbook', time: '12 min read', icon: Star },
  { title: 'Choosing the right competitors to track', time: '6 min read', icon: Users },
];

const HelpPage = () => {
  const [query, setQuery] = useState('');
  const filteredFaqs = faqs.filter(
    (f) =>
      f.q.toLowerCase().includes(query.toLowerCase()) ||
      f.a.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-greeting p-8 lg:p-12 mb-8 text-center">
        <div
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card mb-4"
          style={{ boxShadow: 'var(--neu-shadow)' }}
        >
          <BookOpen className="w-7 h-7 text-primary" />
        </div>
        <h1 className="font-display text-3xl lg:text-4xl font-bold mb-3">How can we help?</h1>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Search guides, browse FAQs, or chat with our team. We usually reply within 2 hours on weekdays.
        </p>
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for 'reviews', 'score', 'cancel'..."
            className="pl-12 bg-card border-0 text-base"
            style={{ boxShadow: 'var(--neu-shadow)', height: '3.25rem' }}
          />
        </div>
      </div>

      {/* Categories */}
      <h2 className="font-display text-xl font-bold mb-4">Browse by topic</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {categories.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card
              className="border-0 cursor-pointer hover:translate-y-[-2px] transition-transform h-full"
              style={{ boxShadow: 'var(--neu-shadow)' }}
            >
              <CardContent className="p-5 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${c.bg} ${c.color} flex items-center justify-center shrink-0`}>
                  <c.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm mb-1">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.count} articles</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-10">
        {/* FAQs */}
        <div className="lg:col-span-2">
          <h2 className="font-display text-xl font-bold mb-4">
            {query ? `Results for "${query}"` : 'Frequently asked questions'}
          </h2>
          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardContent className="p-2">
              {filteredFaqs.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaqs.map((f, i) => (
                    <AccordionItem key={i} value={`item-${i}`} className="border-border/50 last:border-0 px-4">
                      <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">
                        {f.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                        {f.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground text-sm mb-3">No articles match &ldquo;{query}&rdquo;.</p>
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>Clear search</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Guides */}
        <div>
          <h2 className="font-display text-xl font-bold mb-4">Popular guides</h2>
          <div className="space-y-3">
            {guides.map((g) => (
              <Card
                key={g.title}
                className="border-0 cursor-pointer hover:translate-y-[-2px] transition-transform"
                style={{ boxShadow: 'var(--neu-shadow)' }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <g.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight mb-0.5">{g.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="w-3 h-3" />{g.time}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

        </div>
      </div>

      {/* Contact */}
      <h2 className="font-display text-xl font-bold mb-4">Still need help?</h2>
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Email support</CardTitle>
                <CardDescription className="text-xs">Reply within 2 business hours</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="subject" className="text-xs">Subject</Label>
              <Input id="subject" placeholder="What's it about?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg" className="text-xs">Message</Label>
              <Textarea id="msg" placeholder="Tell us what's going on..." rows={3} />
            </div>
            <Button variant="cta" className="w-full gap-2">
              <Send className="w-4 h-4" />Send message
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
};

export default HelpPage;
