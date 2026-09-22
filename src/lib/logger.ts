/* eslint-disable no-console -- this module is the only sanctioned console writer */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Field names matching this are replaced with [redacted] before the line is written. */
const SECRET_FIELD = /secret|key|token|password/i;

const REDACTED = '[redacted]';

function threshold(): number {
  const rank = LEVEL_RANK[process.env.LOG_LEVEL?.toLowerCase() as LogLevel];
  return typeof rank === 'number' ? rank : LEVEL_RANK.info;
}

function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_FIELD.test(k) ? REDACTED : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

function serialize(fields: Record<string, unknown>): string {
  try {
    return JSON.stringify(redact(fields));
  } catch {
    return '{"logger":"unserializable fields"}';
  }
}

function emit(level: LogLevel, scope: string, message: string, fields?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < threshold()) return;
  const suffix = fields && Object.keys(fields).length > 0 ? ` ${serialize(fields)}` : '';
  const line = `[${level}] [${scope}] ${message}${suffix}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Structured server-side logger. One line per call:
 * `[level] [scope] message {json fields}`.
 *
 * Scope is the grep handle — reuse the bracketed prefix a call site already
 * had (e.g. `[crawl-worker]`). Fields whose name looks like a credential are
 * redacted, and Errors are flattened to `{ name, message }`.
 */
export const logger = {
  debug: (scope: string, message: string, fields?: Record<string, unknown>) =>
    emit('debug', scope, message, fields),
  info: (scope: string, message: string, fields?: Record<string, unknown>) =>
    emit('info', scope, message, fields),
  warn: (scope: string, message: string, fields?: Record<string, unknown>) =>
    emit('warn', scope, message, fields),
  error: (scope: string, message: string, fields?: Record<string, unknown>) =>
    emit('error', scope, message, fields),
};
