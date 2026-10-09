import type { Business } from '@/types';
import type { ServiceCategory } from '@/lib/serviceCategories';

/** Values a template can personalise with. Missing values fall back to generic copy. */
export type TemplateContext = {
  service?: string;
  town?: string;
  name?: string;
  /** Every place name the business may use: project location, address town, address area. */
  places?: string[];
  serviceCategory?: ServiceCategory;
  /** Set by applyTemplates so triggers can check competitor-relative gaps. */
  competitors?: Business[];
};

const UK_POSTCODE = /\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i;
const COUNTRIES = new Set([
  'uk',
  'united kingdom',
  'england',
  'scotland',
  'wales',
  'northern ireland',
]);
const MAX_SERVICE_LENGTH = 40;

/**
 * Town and area from an address: "12 Lordship Lane, East Dulwich, London SE22 8HN, UK"
 * gives town "London" and area "East Dulwich". The area is the segment before the
 * town when the first segment is the street.
 */
function placesFromAddress(address: string | undefined): { town?: string; area?: string } {
  if (!address) return {};
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !COUNTRIES.has(p.toLowerCase()));
  if (parts.length < 2) return {};
  const last = parts[parts.length - 1].replace(UK_POSTCODE, '').trim();
  const town = last && !/\d/.test(last) ? last : undefined;
  const before = parts.length >= 3 ? parts[parts.length - 2] : undefined;
  const area = before && !/\d/.test(before) ? before : undefined;
  return { town, area };
}

/** Lower-case the first letter for mid-sentence use, unless it starts an acronym ("IT repairs"). */
function lowerFirst(s: string): string {
  return /^[A-Z][A-Z]/.test(s) ? s : s[0].toLowerCase() + s.slice(1);
}

/**
 * Resolve personalisation values for one business. Town prefers the project's
 * own location (typed by the user) over the parsed Google address; service
 * prefers the first short service listed on the site over the Google category.
 */
export function resolveTemplateContext(
  b: Business,
  projectLocation?: string | null,
  serviceCategory?: ServiceCategory,
): TemplateContext {
  const fromAddress = placesFromAddress(b.googleData?.address);
  const town = projectLocation?.trim() || fromAddress.town;
  const places = [
    ...new Set([projectLocation?.trim(), fromAddress.town, fromAddress.area].filter(Boolean)),
  ] as string[];
  const listed = b.signals?.content?.servicesListed?.[0]?.trim();
  const category = b.googleData?.businessCategory?.replace(/_/g, ' ').trim();
  const service =
    (listed && listed.length <= MAX_SERVICE_LENGTH ? listed : undefined) || category || undefined;
  return {
    town: town || undefined,
    service: service && lowerFirst(service),
    name: b.name || undefined,
    places,
    serviceCategory,
  };
}

const SEGMENT = /\[\[(.*?)(?:\|\|(.*?))?\]\]/g;
const TOKEN = /\{(service|Service|town|name)\}/g;

function resolveToken(name: string, ctx: TemplateContext): string | undefined {
  if (name === 'town') return ctx.town;
  if (name === 'name') return ctx.name;
  if (!ctx.service) return undefined;
  return name === 'Service' ? ctx.service[0].toUpperCase() + ctx.service.slice(1) : ctx.service;
}

/**
 * Fill `[[personalised||fallback]]` segments. The personalised text is used only
 * when every `{service}` / `{Service}` / `{town}` token in it resolves; otherwise
 * the fallback (or nothing, when there is no `||`) is used. Tokens only ever
 * appear inside segments, so output never shows a raw placeholder.
 */
export function fillTemplate(text: string, ctx: TemplateContext): string {
  return text.replace(SEGMENT, (_m, personalised: string, fallback?: string) => {
    let complete = true;
    const filled = personalised.replace(TOKEN, (_t, name: string) => {
      const v = resolveToken(name, ctx);
      if (v == null) complete = false;
      return v ?? '';
    });
    return complete ? filled : (fallback ?? '');
  });
}

/** "A", "A and B", "A, B and C", "A, B and 3 others". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}
