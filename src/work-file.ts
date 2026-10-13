/* Generated from schema/work.schema.json by `npm run gen`. Do not edit. */

/**
 * Contents of data/works/<last character of id>/<id>.json: one work and its public logs. Unknown properties are allowed so that producers can add fields without breaking older generators.
 */
export interface WorkFile {
  /**
   * Also the file name without .json. The file sits in the directory named by the last character of the id.
   */
  id: string;
  /**
   * Media type. Known values: movie, tv, streaming, music, book, other. Unknown values are rendered as other.
   */
  type: string;
  title: string;
  /**
   * Directory path separated by "/", for example "movies/2026". May be empty.
   */
  path: string;
  tags: string[];
  status?: string;
  platform?: string;
  year?: number | null;
  creators?: string[];
  /**
   * An https URL, or an empty string.
   */
  coverUrl?: string;
  externalIds?: {
    [k: string]: string;
  };
  /**
   * Broadcast season, for example "2026-autumn" (winter: Jan-Mar, spring: Apr-Jun, summer: Jul-Sep, autumn: Oct-Dec). May be empty.
   */
  season?: string;
  /**
   * Total number of episodes, when known.
   */
  episodeCount?: number | null;
  logs: LogEntry[];
}
export interface LogEntry {
  /**
   * Unique within the work. Used as a URL segment.
   */
  id: string;
  /**
   * Display name.
   */
  author: string;
  loggedAt: string;
  rating?: number | null;
  text: string;
  /**
   * Episode number watched in this log.
   */
  episode?: number | null;
  /**
   * Last episode when one log covers several; ignored unless greater than episode.
   */
  episodeEnd?: number | null;
  /**
   * Episode subtitle. May be empty.
   */
  subtitle?: string;
  program?: ProgramInfo | null;
}
export interface ProgramInfo {
  channel: string;
  date: string;
  start?: string;
  /**
   * HH:mm. May be empty.
   */
  end?: string;
  title?: string;
  /**
   * Where the program info came from, for example "nhk" or "manual". May be empty.
   */
  source?: string;
  /**
   * An https URL of the official program page, or an empty string.
   */
  url?: string;
}
