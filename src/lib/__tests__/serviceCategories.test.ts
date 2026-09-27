import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_KEYS,
  SERVICE_CATEGORY_OPTIONS,
  GENERIC_AI_QUERY_TEMPLATES,
  type ServiceCategory,
} from '@/lib/serviceCategories';

describe('SERVICE_CATEGORIES', () => {
  const entries = Object.entries(SERVICE_CATEGORIES);

  it('every category has a label, a human searchTerm and a country modifier', () => {
    for (const [key, cfg] of entries) {
      expect(cfg.label, key).toBeTruthy();
      expect(cfg.searchTerm, key).toMatch(/^[a-z][a-z &'-]+$/i);
      expect(cfg.searchTerm, key).not.toContain('_');
      expect(cfg.countryModifier, key).toBeTruthy();
    }
  });

  // checkAIVisibility runs one query per template; categories currently ship 3–5 templates.
  it('every category has at least 3 AI query templates that place the query', () => {
    for (const [key, cfg] of entries) {
      expect(cfg.aiQueryTemplates.length, key).toBeGreaterThanOrEqual(3);
      for (const t of cfg.aiQueryTemplates) {
        expect(t, `${key}: ${t}`).toContain('{location}');
      }
    }
  });

  it('dashboardPriority and keyMetrics are non-empty and unique', () => {
    for (const [key, cfg] of entries) {
      expect(new Set(cfg.dashboardPriority).size, key).toBe(cfg.dashboardPriority.length);
      expect(cfg.keyMetrics.length, key).toBeGreaterThan(0);
    }
  });

  it('options mirror the categories and generic templates are the fallback for "other"', () => {
    expect(SERVICE_CATEGORY_OPTIONS.map((o) => o.value)).toEqual(Object.keys(SERVICE_CATEGORIES));
    expect(SERVICE_CATEGORIES.other.aiQueryTemplates).toBe(GENERIC_AI_QUERY_TEMPLATES);
  });
});

/**
 * The config is declared with `as const satisfies`, so the key tuple, the
 * `ServiceCategory` union and the record can never drift apart, and the
 * searchTerm a SERP query is built from stays a literal rather than widening to
 * `string`. Checked by `bun run typecheck`.
 */
describe('SERVICE_CATEGORIES types', () => {
  it('derives the category union from the key tuple', () => {
    expectTypeOf<(typeof SERVICE_CATEGORY_KEYS)[number]>().toEqualTypeOf<ServiceCategory>();
    expectTypeOf<keyof typeof SERVICE_CATEGORIES>().toEqualTypeOf<ServiceCategory>();
  });

  it('keeps each config literal narrow', () => {
    expectTypeOf(SERVICE_CATEGORIES.accounting.searchTerm).toEqualTypeOf<'accountant'>();
    expectTypeOf(SERVICE_CATEGORIES.other.label).toEqualTypeOf<'Other'>();
    expectTypeOf<
      (typeof SERVICE_CATEGORY_OPTIONS)[number]['value']
    >().toEqualTypeOf<ServiceCategory>();
  });

  it('exposes the config as read-only, since every consumer only reads it', () => {
    expectTypeOf(SERVICE_CATEGORIES.other.aiQueryTemplates).toExtend<readonly string[]>();
    expectTypeOf(SERVICE_CATEGORIES.other.dashboardPriority).toExtend<readonly string[]>();
  });
});
