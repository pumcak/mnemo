import { describe, expect, it } from 'vitest';
import { formatDomains, parseDomains } from './domains';

describe('parseDomains', () => {
  it('reads one domain per line', () => {
    expect(parseDomains('adult.example\nwork.internal').domains).toEqual([
      'adult.example',
      'work.internal',
    ]);
  });

  it('accepts commas and extra spacing, because people type both', () => {
    expect(parseDomains('  adult.example ,  work.internal  ').domains).toEqual([
      'adult.example',
      'work.internal',
    ]);
  });

  it('accepts a whole address pasted in', () => {
    expect(parseDomains('https://www.adult.example/videos?page=2').domains).toEqual([
      'adult.example',
    ]);
  });

  it('drops the leading www, so one site is one entry', () => {
    expect(parseDomains('www.adult.example\nadult.example').domains).toEqual(['adult.example']);
  });

  it('lowercases, since hostnames do not care and the comparison does', () => {
    expect(parseDomains('Adult.Example').domains).toEqual(['adult.example']);
  });

  it('keeps a subdomain that is not www, which is somebody being specific', () => {
    expect(parseDomains('videos.adult.example').domains).toEqual(['videos.adult.example']);
  });

  it('reports what it could not understand instead of dropping it silently', () => {
    const parsed = parseDomains('adult.example\nnot a domain at all\nlocalhost');

    expect(parsed.domains).toEqual(['adult.example']);
    expect(parsed.rejected).toEqual(['not', 'a', 'domain', 'at', 'all', 'localhost']);
  });

  it('reads an empty box as an empty list', () => {
    expect(parseDomains('   \n  ')).toEqual({ domains: [], rejected: [] });
  });

  it('round trips through the text it displays', () => {
    const domains = ['adult.example', 'work.internal'];

    expect(parseDomains(formatDomains(domains)).domains).toEqual(domains);
  });
});
