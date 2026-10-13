import type { LogEntry, ProgramInfo, WorkFile } from './work-file.ts';

export const MEDIA_TYPES = ['tv', 'movie', 'streaming', 'music', 'book', 'other'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  tv: 'TV',
  movie: '映画',
  streaming: '配信',
  music: '音楽',
  book: '本',
  other: 'その他',
};

// Work is the normalized form used for rendering: the media type is narrowed to a known value.
export type ProgramRef = ProgramInfo;
export type Log = LogEntry;
export type Work = Omit<WorkFile, 'type' | 'logs'> & { type: MediaType; logs: Log[] };

export interface SiteConfig {
  title: string;
  basePath: string; // always starts and ends with "/"
  cname?: string;
}
