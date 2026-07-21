import type { BrowseEntry } from '../types';

export type SortMethod =
  | 'name_asc'
  | 'name_desc'
  | 'date_desc'
  | 'date_asc'
  | 'size_desc'
  | 'size_asc'
  | 'type';

const TYPE_ORDER: Record<BrowseEntry['type'], number> = {
  folder: 0,
  image: 1,
  video: 2,
  file: 3,
};

function compareName(a: BrowseEntry, b: BrowseEntry): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function getSortTimestamp(entry: BrowseEntry): number {
  const value = entry.captureTime ?? entry.mtime;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareDate(a: BrowseEntry, b: BrowseEntry): number {
  return getSortTimestamp(a) - getSortTimestamp(b);
}

function compareSize(a: BrowseEntry, b: BrowseEntry): number {
  return (a.size ?? 0) - (b.size ?? 0);
}

function compareType(a: BrowseEntry, b: BrowseEntry): number {
  const typeDiff = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  if (typeDiff !== 0) return typeDiff;
  return compareName(a, b);
}

export function sortEntries(entries: BrowseEntry[], sort: SortMethod): BrowseEntry[] {
  const folders = entries.filter((entry) => entry.type === 'folder');
  const media = entries.filter((entry) => entry.type !== 'folder');

  const sortGroup = (items: BrowseEntry[]): BrowseEntry[] => {
    const sorted = [...items];
    switch (sort) {
      case 'name_desc':
        sorted.sort((a, b) => compareName(b, a));
        break;
      case 'date_desc':
        sorted.sort((a, b) => compareDate(b, a));
        break;
      case 'date_asc':
        sorted.sort((a, b) => compareDate(a, b));
        break;
      case 'size_desc':
        sorted.sort((a, b) => compareSize(b, a));
        break;
      case 'size_asc':
        sorted.sort((a, b) => compareSize(a, b));
        break;
      case 'type':
        sorted.sort(compareType);
        break;
      case 'name_asc':
      default:
        sorted.sort(compareName);
        break;
    }
    return sorted;
  };

  if (sort === 'type') {
    return sortGroup(entries);
  }

  return [...sortGroup(folders), ...sortGroup(media)];
}

export const SORT_OPTIONS: { id: SortMethod; label: string }[] = [
  { id: 'name_asc', label: 'Name (A–Z)' },
  { id: 'name_desc', label: 'Name (Z–A)' },
  { id: 'date_desc', label: 'Date (newest)' },
  { id: 'date_asc', label: 'Date (oldest)' },
  { id: 'size_desc', label: 'Size (largest)' },
  { id: 'size_asc', label: 'Size (smallest)' },
  { id: 'type', label: 'Type' },
];
