/**
 * Brings two spellings of the same title to the same string.
 *
 * Accents, case, apostrophes and punctuation vary between a catalogue and a page
 * for reasons that say nothing about which work it is: "Frieren: Beyond
 * Journey's End" and "Frieren Beyond Journeys End" are the same show.
 */
export const normalizeTitle = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const bigrams = (value: string): string[] => {
  const compact = value.replace(/\s+/g, ' ');
  const pairs: string[] = [];

  for (let index = 0; index < compact.length - 1; index += 1) {
    pairs.push(compact.slice(index, index + 2));
  }

  return pairs;
};

/**
 * How alike two titles are, from zero to one.
 *
 * Dice over character pairs, because it forgives a missing word or a typo without
 * being fooled by word order the way a plain prefix test is. Equal normalised
 * strings score one outright, which is what a short title like "Heat" needs: one
 * pair difference would otherwise cost it a third of its score.
 */
export const titleSimilarity = (left: string, right: string): number => {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);

  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const pairsOfA = bigrams(a);
  const pairsOfB = bigrams(b);

  if (pairsOfA.length === 0 || pairsOfB.length === 0) {
    return 0;
  }

  const remaining = new Map<string, number>();

  for (const pair of pairsOfB) {
    remaining.set(pair, (remaining.get(pair) ?? 0) + 1);
  }

  let shared = 0;

  for (const pair of pairsOfA) {
    const count = remaining.get(pair) ?? 0;

    if (count > 0) {
      shared += 1;
      remaining.set(pair, count - 1);
    }
  }

  return (2 * shared) / (pairsOfA.length + pairsOfB.length);
};
