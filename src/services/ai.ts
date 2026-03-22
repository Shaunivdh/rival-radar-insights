import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedSignals, PriorityAction, ChangeSummary, Business, AIVisibility } from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function askClaude<T>(prompt: string): Promise<T> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as { type: string; text: string }).text.trim();
  const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(json) as T;
}

export async function generatePriorityActions(own: Business, competitors: Business[]): Promise<PriorityAction[]> {
  const prompt = `Compare this business against competitors and return 3-5 priority actions as JSON array only.
Schema per item: {"priority":1|2|3,"category":"string","action":"string","reason":"string","competitorReference":"string","estimatedImpact":"high"|"medium"|"low","timeframe":"string"}
Own: ${JSON.stringify({ name: own.name, signals: own.signals })}
Competitors: ${JSON.stringify(competitors.map((c) => ({ name: c.name, signals: c.signals })))}`;
  return askClaude<PriorityAction[]>(prompt);
}

export async function checkAIVisibility(
  primaryService: string,
  location: string,
  businessName: string,
  domain: string
): Promise<AIVisibility> {
  const prompt = `Can you recommend a ${primaryService} in ${location}? I'm looking for someone reliable and well-reviewed.`;
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (msg.content[0] as { type: string; text: string }).text;
  const lower = text.toLowerCase();
  const mentioned =
    lower.includes(businessName.toLowerCase()) || lower.includes(domain.toLowerCase());

  let excerpt: string | null = null;
  if (mentioned) {
    const idx =
      lower.indexOf(businessName.toLowerCase()) !== -1
        ? lower.indexOf(businessName.toLowerCase())
        : lower.indexOf(domain.toLowerCase());
    excerpt = text.slice(Math.max(0, idx - 50), idx + 150).trim();
  }

  return { mentioned, excerpt, tested_at: new Date().toISOString() };
}

export async function generateChangeSummary(
  name: string,
  before: ExtractedSignals,
  after: ExtractedSignals
): Promise<ChangeSummary> {
  const prompt = `Summarise website changes for "${name}". Return JSON only.
Schema: {"hasSignificantChanges":boolean,"severity":"high"|"medium"|"low","summary":"string","changes":[{"category":"string","description":"string","significance":"string"}]}
Summary max 15 words. Max 5 changes.
Before: ${JSON.stringify(before)}
After: ${JSON.stringify(after)}`;
  return askClaude<ChangeSummary>(prompt);
}
