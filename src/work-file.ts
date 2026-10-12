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
  logs: LogEntry[];
}
export interface LogEntry {
  id: string;
  /**
   * Display name.
   */
  author: string;
  loggedAt: string;
  rating?: number | null;
  text: string;
  program?: ProgramInfo | null;
}
export interface ProgramInfo {
  channel: string;
  date: string;
  start?: string;
  title?: string;
}
