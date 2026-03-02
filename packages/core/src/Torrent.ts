export interface TorrentProps {
  hash: string;
  name: string;
  progress: number;
  state: string;
  downloadSpeed: number;
  uploadSpeed: number;
  contentPath: string;
}

export class Torrent {
  public readonly hash: string;
  public readonly name: string;
  public readonly progress: number;
  public readonly state: string;
  public readonly downloadSpeed: number;
  public readonly uploadSpeed: number;
  public readonly contentPath: string;

  constructor(props: TorrentProps) {
    this.hash = props.hash;
    this.name = props.name;
    this.progress = props.progress;
    this.state = props.state;
    this.downloadSpeed = props.downloadSpeed;
    this.uploadSpeed = props.uploadSpeed;
    this.contentPath = props.contentPath;
  }

  public get isComplete(): boolean {
    return this.progress === 1;
  }

  public getMediaInfo(): { title: string; year: number | null } {
    // 1. Try TV Show pattern: Title.S01E01...
    const tvMatch = this.name.match(/^(.*?)[. ]S(\d{1,2})E(\d{1,2})/i);
    if (tvMatch) {
      const title = tvMatch[1].replace(/[.]/g, ' ').trim();
      return { title, year: null };
    }

    // 2. Try Movie pattern with Year: Title.2024...
    const yearMatch = this.name.match(/^(.*?)[. ](\d{4})[. ]/);
    if (yearMatch) {
      const title = yearMatch[1].replace(/[.]/g, ' ').trim();
      const year = parseInt(yearMatch[2], 10);
      return { title, year };
    }

    // Fallback: use the whole name as title if no pattern found
    return {
      title: this.name.replace(/[.]/g, ' ').trim(),
      year: null
    };
  }
}
