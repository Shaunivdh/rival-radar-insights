import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
    constructor() {}
  },
}));

import { checkAIVisibility, runVisibilityQuery } from '@/services/ai';

const run = async (location: string) => {
  const getResponse = vi.fn(async (_q: string, _place?: unknown) => 'Polished Dulwich is great.');
  await checkAIVisibility('beauty', location, 'Polished Dulwich', null, 'beauty', getResponse);
  return getResponse.mock.calls;
};

describe('AI visibility stays local', () => {
  beforeEach(() => mockCreate.mockReset());

  it('puts the country next to the place in every query, not tacked on the end', async () => {
    const calls = await run('East Dulwich');
    for (const [q] of calls) {
      expect(q).toContain('East Dulwich, UK');
      expect(q).not.toMatch(/[^,] UK$/);
    }
    expect(calls[0][0]).toBe('Best beauty salon in East Dulwich, UK');
  });

  it('does not double the country when the location already names it', async () => {
    const calls = await run('East Dulwich, London, UK');
    expect(calls[0][0]).toBe('Best beauty salon in East Dulwich, London, UK');
  });

  it('passes an approximate UK location for the web search', async () => {
    const calls = await run('East Dulwich');
    expect(calls[0][1]).toEqual({
      city: 'East Dulwich',
      country: 'GB',
      timezone: 'Europe/London',
    });
  });

  it('sends user_location on the web search tool and asks for local businesses only', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'answer' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await runVisibilityQuery('Best beauty salon in East Dulwich, UK', {
      city: 'East Dulwich',
      country: 'GB',
      timezone: 'Europe/London',
    });
    const req = mockCreate.mock.calls[0][0];
    expect(req.tools[0].user_location).toEqual({
      type: 'approximate',
      city: 'East Dulwich',
      country: 'GB',
      timezone: 'Europe/London',
    });
    expect(req.system).toMatch(/only/i);
    expect(req.system).toMatch(/area named in the question/);
  });
});
