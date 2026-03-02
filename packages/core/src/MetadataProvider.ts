import { MediaMetadata } from './MediaMetadata.js';

export interface MetadataProvider {
  search(title: string, year?: number): Promise<MediaMetadata | null>;
}
