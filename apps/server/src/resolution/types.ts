import type { CatalogueName, WorkKind } from '@mnemo/resolver';

/** What a person is shown when asked to settle a title. Kept small: the top few, not every match. */
export interface ReviewCandidate {
  catalogue: CatalogueName;
  externalId: number;
  kind: WorkKind;
  title: string;
  year?: number;
  score: number;
}

export const reviewStatuses = ['pending', 'resolved', 'dismissed'] as const;

export type ReviewStatus = (typeof reviewStatuses)[number];
