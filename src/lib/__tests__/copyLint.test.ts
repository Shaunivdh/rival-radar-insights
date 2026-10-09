import { describe, it, expect } from 'vitest';
import { lintCopy } from '@/lib/copyLint';
import { PRIORITY_TEMPLATES } from '@/lib/priorityTemplates';

describe('lintCopy', () => {
  it('flags dashes and arrows used as punctuation', () => {
    expect(lintCopy('Fast — and cheap')).toEqual([{ kind: 'dash', match: '—' }]);
    expect(lintCopy('2–3 hours')).toEqual([{ kind: 'dash', match: '–' }]);
    expect(lintCopy('Click here → book')).toEqual([{ kind: 'dash', match: '→' }]);
    expect(lintCopy('Call us - we reply fast')).toEqual([{ kind: 'dash', match: ' - ' }]);
  });

  it('allows hyphens inside compound words', () => {
    expect(lintCopy('A top-rated, plain-English, same-day service')).toEqual([]);
  });

  it('flags US spellings, case-insensitively', () => {
    expect(lintCopy('Organize your color scheme').map((i) => i.match)).toEqual([
      'Organize',
      'color',
    ]);
    expect(lintCopy('Send an inquiry about our center').map((i) => i.match)).toEqual([
      'inquiry',
      'center',
    ]);
  });

  it('does not flag UK spellings or look-alike words', () => {
    expect(lintCopy('Organise the colour, size and prize; check the gas meter.')).toEqual([]);
  });

  it('passes every template string', () => {
    for (const t of PRIORITY_TEMPLATES) {
      const copy = [t.action, t.reason, t.whyItMattersTemplate, ...t.steps, t.outcome].join(' ');
      expect(lintCopy(copy), t.id).toEqual([]);
    }
  });
});
