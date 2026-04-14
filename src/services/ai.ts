import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedSignals, PriorityAction, ChangeSummary, Business } from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function extractPageSignals(html: string, prompt: string): Promise<Record<string, unknown>> {
  const stripped = html
    .replace(/<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .slice(0, 24000);
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: `${prompt}\n\nHTML:\n${stripped}\n\nReturn JSON only, no markdown.` }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    console.warn('[extractPageSignals] failed:', e);
    return {};
  }
}

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


export async function generateChangeSummary(
  name: string,
  before: ExtractedSignals,
  after: ExtractedSignals
): Promise<ChangeSummary> {
  const strip = (s: ExtractedSignals): ExtractedSignals => ({
    ...s,
    seo: s.seo,
  });
  const prompt = `Summarise website changes for "${name}". Return JSON only.
Schema: {"hasSignificantChanges":boolean,"severity":"high"|"medium"|"low","summary":"string","changes":[{"category":"string","description":"string","significance":"string"}]}
Summary max 15 words. Max 5 changes.
Before: ${JSON.stringify(strip(before))}
After: ${JSON.stringify(strip(after))}`;
  return askClaude<ChangeSummary>(prompt);
}
