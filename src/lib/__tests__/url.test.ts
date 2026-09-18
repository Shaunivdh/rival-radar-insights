import { describe, it, expect } from 'vitest';
import { normalizeUrl, isValidUrl, extractDomain } from '@/lib/url';

describe('normalizeUrl', () => {
  it('prefixes https and keeps existing schemes', () => {
    expect(normalizeUrl('mspdetails.co.uk')).toBe('https://mspdetails.co.uk');
    expect(normalizeUrl('  www.mspdetails.co.uk ')).toBe('https://www.mspdetails.co.uk');
    expect(normalizeUrl('http://mspdetails.co.uk')).toBe('http://mspdetails.co.uk');
    expect(normalizeUrl('HTTPS://mspdetails.co.uk')).toBe('HTTPS://mspdetails.co.uk');
  });
});

describe('isValidUrl', () => {
  it('accepts dotted hosts and rejects the rest', () => {
    expect(isValidUrl('mspdetails.co.uk')).toBe(true);
    expect(isValidUrl('https://www.example.com/path?q=1')).toBe(true);
    expect(isValidUrl('localhost')).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('extractDomain', () => {
  it('returns the hostname, or the trimmed input when unparseable', () => {
    expect(extractDomain('www.example.com/about')).toBe('www.example.com');
    expect(extractDomain('https://example.com:8443/x')).toBe('example.com');
    expect(extractDomain(' ::: ')).toBe(':::');
  });
});
