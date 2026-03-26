import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedSignals, PriorityAction, ChangeSummary, Business, AIVisibility } from '@/types';

const PRESENCE_PROMPTS = (service: string, location: string) => [
  `What are the best ${service} companies in ${location}?`,
  `Who should I hire for ${service} near ${location}?`,
  `Recommend a trusted ${service} in ${location}`,
];

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

export async function checkAIPresence(
  primaryService: string,
  location: string,
  businessName: string,
  domain: string
): Promise<AIVisibility> {
  const prompts = PRESENCE_PROMPTS(primaryService, location);
  const nameLower = businessName.toLowerCase();
  const domainLower = domain.toLowerCase();

  const results = await Promise.all(
    prompts.map(async (prompt) => {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = (msg.content[0] as { type: string; text: string }).text.toLowerCase();
      return text.includes(nameLower) || text.includes(domainLower);
    })
  );

  const mentionCount = results.filter(Boolean).length;
  const totalPrompts = prompts.length;
  const scoreMap: Record<number, number> = { 0: 0, 1: 33, 2: 67, 3: 100 };
  const aiPresenceScore = scoreMap[mentionCount] ?? 0;

  return { aiPresenceScore, mentionCount, totalPrompts, tested_at: new Date().toISOString() };
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
