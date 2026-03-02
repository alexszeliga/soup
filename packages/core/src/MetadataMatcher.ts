import { MediaMetadata } from './MediaMetadata.js';
import { MetadataProvider } from './MetadataProvider.js';
import { Torrent } from './Torrent.js';

export class MetadataMatcher {
  constructor(private readonly provider: MetadataProvider) {}

  public async match(torrent: Torrent): Promise<MediaMetadata | null> {
    const { title, year } = torrent.getMediaInfo();
    
    // Explicitly handle the search
    const result = await this.provider.search(title, year ?? undefined);
    
    return result;
  }
}
