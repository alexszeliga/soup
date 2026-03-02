export interface MediaMetadataProps {
  id: string;
  title: string;
  year: number;
  plot: string;
  cast: string[];
  posterPath: string;
}

export class MediaMetadata {
  public readonly id: string;
  public readonly title: string;
  public readonly year: number;
  public readonly plot: string;
  public readonly cast: string[];
  public readonly posterPath: string;

  constructor(props: MediaMetadataProps) {
    this.id = props.id;
    this.title = props.title;
    this.year = props.year;
    this.plot = props.plot;
    this.cast = props.cast;
    this.posterPath = props.posterPath;
  }
}
