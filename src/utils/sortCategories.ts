const CLASS_ORDER: Record<string, number> = {
  'Nursery': 0,
  'K1': 1,
  'K2': 2,
  'P1': 3,
  'P2': 4,
  'P3': 5,
  'P4': 6,
  'P5': 7,
  'P6': 8,
  'S1S2': 9,
  'S3S4': 10,
  'Junior': 11,
  'Senior': 12,
  'Open': 13,
};

const COMPETITION_ORDER: Record<string, number> = {
  'Recital': 0,
  'Oratorical': 1,
};

function classRank(className: string): number {
  return CLASS_ORDER[className] ?? 99;
}

function competitionRank(competitionName: string): number {
  for (const key of Object.keys(COMPETITION_ORDER)) {
    if (competitionName.toLowerCase().includes(key.toLowerCase())) {
      return COMPETITION_ORDER[key];
    }
  }
  return 99;
}

export function sortCategories<T extends { competition_name: string; class_name: string }>(cats: T[]): T[] {
  return [...cats].sort((a, b) => {
    const compDiff = competitionRank(a.competition_name) - competitionRank(b.competition_name);
    if (compDiff !== 0) return compDiff;
    return classRank(a.class_name) - classRank(b.class_name);
  });
}
