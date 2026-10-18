import { describe, expect, it } from 'vitest';
import { detectAnimeRelease } from './anime';
import { corpus } from './corpus';
import { parseRawTitle } from './parse';
import { planRoute } from './resolve';

/**
 * Freezes how the resolver reads every title in the corpus, down to what cleaning
 * removed and which catalogues it would ask.
 *
 * The corpus tests check the answer. This checks the reasoning: a change to the
 * tag lists or to the numbering rules can keep every answer right while starting
 * to remove something it should not, or to route a title to the wrong catalogue
 * first. Any such change now shows up as a diff to accept or reject on purpose.
 */
describe('how the resolver reads the corpus', () => {
  it.each(corpus.map((entry) => [entry.raw, entry] as const))('%j', (_raw, entry) => {
    const parsed = parseRawTitle(entry.raw);

    expect({
      parsed,
      anime: detectAnimeRelease(entry.raw),
      route: planRoute(parsed, entry.raw),
    }).toMatchSnapshot();
  });
});
