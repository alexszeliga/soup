/**
 * Properties required to instantiate a MediaMetadata object.
 */
export interface MediaMetadataProps {
  /** Unique identifier from the metadata provider (e.g., TMDB ID). */
  id: string;
  /** Clean title of the movie or TV show. */
  title: string;
  /** Release year. */
  year: number;
  /** Brief summary of the plot. */
  plot: string;
  /** List of primary cast members. */
  cast: string[];
  /** URL or relative path to the box art / poster image. */
  posterPath: string;
}

/**
 * Domain model representing rich information about a piece of media (Movie/Show).
 * 
 * This model is decoupled from the raw Torrent data and can be cached independently.
 */
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
