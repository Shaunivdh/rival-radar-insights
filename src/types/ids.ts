/**
 * Nominal (branded) identifier types.
 *
 * `ProjectId` and `BusinessId` are both strings at runtime, so a branded id can
 * be passed anywhere a `string` is expected, logged, or put in a URL. What the
 * brand buys is the other direction: a bare `string` is not assignable to
 * `BusinessId`, so a swapped argument (`fetchPriorityActions(businessId)`) is a
 * compile error instead of an empty result set.
 *
 * The `as` casts below are the only ones in the app that mint a branded id.
 * Call them at the edges where an untyped string enters: a database row, a route
 * param, a form field, an Inngest event payload.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ProjectId = Brand<string, 'ProjectId'>;
export type BusinessId = Brand<string, 'BusinessId'>;
export type PriorityActionId = Brand<string, 'PriorityActionId'>;

export function asProjectId(id: string): ProjectId {
  return id as ProjectId;
}

export function asBusinessId(id: string): BusinessId {
  return id as BusinessId;
}

export function asPriorityActionId(id: string): PriorityActionId {
  return id as PriorityActionId;
}
