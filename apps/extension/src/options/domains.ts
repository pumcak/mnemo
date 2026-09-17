export interface ParsedDomains {
  domains: string[];
  rejected: string[];
}

const hostnamePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Turns what somebody typed into a list of domains.
 *
 * People paste whole addresses, type one per line, separate with commas and
 * leave the leading www in. All of that is accepted, because the alternative is
 * a blocklist that silently does not block, which is the one mistake this
 * feature cannot afford.
 */
export const parseDomains = (text: string): ParsedDomains => {
  const domains: string[] = [];
  const rejected: string[] = [];

  for (const entry of text.split(/[\s,;]+/)) {
    const trimmed = entry.trim().toLowerCase();

    if (trimmed.length === 0) {
      continue;
    }

    const withoutScheme = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    const hostname = withoutScheme.split('/')[0]?.split('?')[0]?.split(':')[0] ?? '';
    const domain = hostname.replace(/^www\./, '');

    if (!hostnamePattern.test(domain)) {
      rejected.push(entry.trim());
      continue;
    }

    if (!domains.includes(domain)) {
      domains.push(domain);
    }
  }

  return { domains, rejected };
};

export const formatDomains = (domains: readonly string[]): string => domains.join('\n');
