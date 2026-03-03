import type { TorrentWithMetadata } from '@soup/core/LiveSyncService.js';

export type SortOption = 'alphabetical' | 'dateAdded';

/**
 * Sorts an array of torrents based on the selected option.
 * 
 * @param torrents - The list of torrents to sort.
 * @param option - The sorting strategy to apply.
 * @returns A new array containing the sorted torrents.
 */
export function sortTorrents(torrents: TorrentWithMetadata[], option: SortOption): TorrentWithMetadata[] {
  return [...torrents].sort((a, b) => {
    if (option === 'alphabetical') {
      const nameA = a.mediaMetadata?.title || a.name;
      const nameB = b.mediaMetadata?.title || b.name;
      return nameA.localeCompare(nameB);
    } else if (option === 'dateAdded') {
      const dateA = a.addedOn || 0;
      const dateB = b.addedOn || 0;
      return dateB - dateA; // Newest first
    }
    return 0;
  });
}
