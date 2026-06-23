import {
  expandKeyPoints,
  KEY_POINT_CATEGORIES,
  KEY_POINT_CATEGORY_LABELS,
  type KeyPoint,
  type KeyPointCategory,
} from "@content-resourcer/db/key-points";

export function prepareKeyPointsForDisplay(points: KeyPoint[]): KeyPoint[] {
  return expandKeyPoints(points);
}

export function groupKeyPointsByCategory(points: KeyPoint[]): Map<KeyPointCategory, KeyPoint[]> {
  const prepared = prepareKeyPointsForDisplay(points);
  const map = new Map<KeyPointCategory, KeyPoint[]>();
  for (const cat of KEY_POINT_CATEGORIES) {
    map.set(cat, []);
  }
  for (const p of prepared) {
    map.get(p.category)!.push(p);
  }
  return map;
}

export function categoryLabel(category: KeyPointCategory): string {
  return KEY_POINT_CATEGORY_LABELS[category];
}
