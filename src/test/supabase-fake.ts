/**
 * In-memory stand-in for the Supabase query builder, covering the subset the
 * worker, orchestrator and enrichment code use. Rows are plain objects keyed by
 * table; filters, ordering, limit, single/maybeSingle, insert/update/upsert/
 * delete and `{ count: 'exact', head: true }` are supported.
 *
 * Column defaults mirror the schema where code relies on them (ids, timestamps,
 * `extracted_signals.status = 'confirmed'`).
 */
type Row = Record<string, unknown>;
type Result = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

const TS_DEFAULTS: Record<string, string[]> = {
  extracted_signals: ['scanned_at'],
  score_snapshots: ['snapshot_at'],
  priority_actions: ['generated_at'],
  google_data: ['fetched_at'],
  change_events: ['detected_at'],
  crawl_jobs: ['started_at'],
};
const COL_DEFAULTS: Record<string, Row> = {
  extracted_signals: { status: 'confirmed', is_current: true },
  priority_actions: { status: 'active' },
  businesses: { crawl_status: 'idle', enrichment_errors: null },
};

let tick = 0;
/** Strictly increasing ISO timestamps so ORDER BY on defaulted columns is deterministic. */
export function nextTimestamp(): string {
  tick += 1;
  return new Date(Date.UTC(2026, 8, 1, 0, 0, 0) + tick * 1000).toISOString();
}

let idSeq = 0;
function nextId(table: string): string {
  idSeq += 1;
  return `${table}_${idSeq}`;
}

type Filter = (r: Row) => boolean;
type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

class QueryBuilder implements PromiseLike<Result> {
  private op: Op = 'select';
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = [];
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';
  private countExact = false;
  private head = false;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
    if (opts?.count === 'exact') this.countExact = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert';
    this.payload = rows;
    this.onConflict = (opts?.onConflict ?? 'id').split(',').map((s) => s.trim());
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && (r[col] as never) < (val as never));
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && (r[col] as never) <= (val as never));
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && (r[col] as never) > (val as never));
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && (r[col] as never) >= (val as never));
    return this;
  }
  not(col: string, op: string, val: unknown) {
    if (op === 'is') this.filters.push((r) => !(val === null ? r[col] == null : r[col] === val));
    else if (op === 'eq') this.filters.push((r) => r[col] !== val);
    else throw new Error(`FakeSupabase: unsupported not() op ${op}`);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.limitN = to - from + 1;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((v: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private run(): Result {
    const rows = this.db.rows(this.table);
    switch (this.op) {
      case 'insert': {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const inserted = list.map((r) => this.db.withDefaults(this.table, r));
        rows.push(...inserted);
        this.db.log.push({ table: this.table, op: 'insert', rows: inserted });
        return { data: this.head ? null : inserted, error: null };
      }
      case 'update': {
        const targets = this.matching();
        for (const r of targets) Object.assign(r, this.payload);
        this.db.log.push({ table: this.table, op: 'update', rows: targets });
        return { data: this.head ? null : targets, error: null };
      }
      case 'upsert': {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
        const out: Row[] = [];
        for (const r of list) {
          const hit = rows.find((x) => this.onConflict.every((c) => x[c] === r[c]));
          if (hit) {
            Object.assign(hit, r);
            out.push(hit);
          } else {
            const ins = this.db.withDefaults(this.table, r);
            rows.push(ins);
            out.push(ins);
          }
        }
        this.db.log.push({ table: this.table, op: 'upsert', rows: out });
        return { data: out, error: null };
      }
      case 'delete': {
        const targets = new Set(this.matching());
        this.db.tables[this.table] = rows.filter((r) => !targets.has(r));
        return { data: [...targets], error: null };
      }
      case 'select':
      default: {
        let out = this.matching();
        if (this.orderBy) {
          const { col, asc } = this.orderBy;
          out = [...out].sort((a, b) => {
            const x = a[col] as never;
            const y = b[col] as never;
            if (x === y) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            return (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (this.limitN != null) out = out.slice(0, this.limitN);
        if (this.head)
          return { data: null, error: null, count: this.countExact ? out.length : null };
        const clone = out.map((r) => structuredClone(r));
        if (this.mode === 'single') {
          if (clone.length !== 1)
            return {
              data: null,
              error: { message: `single(): expected 1 row, got ${clone.length}`, code: 'PGRST116' },
            };
          return { data: clone[0], error: null };
        }
        if (this.mode === 'maybeSingle') return { data: clone[0] ?? null, error: null };
        return { data: clone, error: null, count: this.countExact ? clone.length : undefined };
      }
    }
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  log: Array<{ table: string; op: Op; rows: Row[] }> = [];

  from(table: string) {
    return new QueryBuilder(this, table);
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  seed(table: string, rows: Row[]) {
    this.rows(table).push(...rows.map((r) => this.withDefaults(table, r)));
    return this;
  }

  reset() {
    this.tables = {};
    this.log = [];
  }

  withDefaults(table: string, r: Row): Row {
    const out: Row = { ...(COL_DEFAULTS[table] ?? {}), ...structuredClone(r) };
    if (out.id === undefined) out.id = nextId(table);
    for (const col of TS_DEFAULTS[table] ?? [])
      if (out[col] === undefined) out[col] = nextTimestamp();
    if (out.created_at === undefined) out.created_at = nextTimestamp();
    return out;
  }
}

/** Shared instance for tests that mock `@/lib/supabase/server` — call `reset()` in beforeEach. */
export const fakeDb = new FakeSupabase();
