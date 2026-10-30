/** Pure, deterministic policies for a bounded Qloo-only decision loop. */
export type TasteTag = { id: string; name: string; type: string; affinity: number };
export type Action = { type: string; reason: string; tags?: string[] };

const CATEGORY: Record<string, string[]> = {
  barbershop: ['artist', 'place', 'brand', 'podcast', 'tv_show'],
  salon: ['artist', 'place', 'brand', 'podcast', 'tv_show'],
  restaurant: ['place', 'artist', 'brand', 'podcast'],
  cafe: ['place', 'artist', 'brand', 'podcast'],
  bar: ['place', 'artist', 'brand', 'podcast'],
  grocery: ['brand', 'place', 'artist', 'podcast', 'tv_show'],
  convenience: ['brand', 'place', 'artist', 'podcast'],
  retail: ['brand', 'artist', 'tv_show', 'place'],
  gym: ['brand', 'artist', 'podcast', 'place'],
  venue: ['artist', 'place', 'podcast', 'brand'],
  other: ['artist', 'brand', 'place', 'podcast'],
};

/** Choose types by business, then steer each non-place call with one compatible observed tag. */
export function planRecommendations(businessType: string, tags: TasteTag[]): Action[] {
  return (CATEGORY[businessType] || CATEGORY.other).map((type) => {
    // Place recommendations are deliberately unsteered: a restrictive taste signal can hide nearby partners.
    const tag = type === 'place' ? undefined : tags.find(t => t.id?.startsWith('urn:tag:') && (t.id.split(':')[3] === type || (type === 'artist' && t.id.startsWith('urn:tag:genre:qloo:'))));
    return tag
      ? { type, tags: [tag.id], reason: `${type}: use the observed ${tag.name} tag as a taste signal` }
      : { type, reason: `${type}: no compatible tag; use location and selected demographics` };
  });
}

export function retryForEmpty(count: number, usedTags: boolean, failed: boolean): boolean {
  return count === 0 && usedTags && !failed;
}
