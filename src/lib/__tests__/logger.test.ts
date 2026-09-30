import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from '@/lib/logger';

const spy = () => vi.spyOn(console, 'log').mockImplementation(() => {});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe('logger', () => {
  it('writes one line as [level] [scope] message {fields}', () => {
    const log = spy();
    logger.info('crawl', 'Crawl completed', { jobId: 'j1', attempts: 3 });
    expect(log).toHaveBeenCalledWith('[info] [crawl] Crawl completed {"jobId":"j1","attempts":3}');
  });

  it('omits the json suffix when there are no fields', () => {
    const log = spy();
    logger.info('crawl', 'No fields');
    expect(log).toHaveBeenCalledWith('[info] [crawl] No fields');
  });

  it('drops levels below LOG_LEVEL and defaults to info', () => {
    const log = spy();
    logger.debug('crawl', 'hidden by default');
    expect(log).not.toHaveBeenCalled();

    process.env.LOG_LEVEL = 'debug';
    logger.debug('crawl', 'now visible');
    expect(log).toHaveBeenCalledOnce();
  });

  it('redacts credential-ish field names, nested too', () => {
    const log = spy();
    logger.info('crawl', 'Request', {
      url: 'https://x.test',
      apiKey: 'sk-live-123',
      headers: { authToken: 'abc', password: 'hunter2' },
    });
    const line = log.mock.calls[0][0] as string;
    expect(line).not.toMatch(/sk-live-123|abc|hunter2/);
    expect(line).toContain('"apiKey":"[redacted]"');
    expect(line).toContain('"authToken":"[redacted]"');
    expect(line).toContain('https://x.test');
  });

  it('flattens Error fields, keeping the stack on one line', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('crawl', 'Failed', { error: new TypeError('boom') });
    const line = err.mock.calls[0][0] as string;
    expect(line).not.toContain('\n');
    expect(line).toContain('[error] [crawl] Failed {"error":{"name":"TypeError","message":"boom"');
    expect(line).toContain('logger.test.ts');
  });

  it('falls back to info when LOG_LEVEL is not a real level', () => {
    const log = spy();
    process.env.LOG_LEVEL = 'toString';
    logger.info('crawl', 'still logged');
    logger.debug('crawl', 'still filtered');
    expect(log).toHaveBeenCalledOnce();
  });
});
