import { StructuredDue, TodoistDue } from './types';

export const EMPTY_DUE: StructuredDue = {
  kind: 'none',
  date: null,
  time: null,
  rawDate: null,
  timezone: null,
  string: null,
  lang: null,
  isRecurring: false,
  source: 'markdown',
};

const DATE_TIME_PATTERN = /(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/;
const MARKDOWN_DUE_PATTERN = new RegExp(`(?:📅\\s*|due:)${DATE_TIME_PATTERN.source}`, 'i');
const DUE_METADATA_PATTERN = /<!--\s*todoist-due:\s*(\{.*?\})\s*-->/;

export function emptyDue(source: StructuredDue['source'] = 'markdown'): StructuredDue {
  return { ...EMPTY_DUE, source };
}

export function parseMarkdownDue(content: string): StructuredDue {
  const metadata = parseDueMetadata(content);
  const match = content.match(MARKDOWN_DUE_PATTERN);
  if (!match) return metadata ?? emptyDue('markdown');

  const date = match[1];
  const hour = match[2];
  const minute = match[3];
  const visibleDue: StructuredDue = {
    ...emptyDue('markdown'),
    kind: hour && minute ? 'floating' : 'date',
    date,
    time: hour && minute ? `${hour.padStart(2, '0')}:${minute}` : null,
    rawDate: hour && minute ? `${date}T${hour.padStart(2, '0')}:${minute}:00` : date,
  };

  if (!metadata) return visibleDue;
  return {
    ...metadata,
    date: visibleDue.date,
    time: visibleDue.time,
    source: metadata.source,
  };
}

export function parseDueMetadata(content: string): StructuredDue | null {
  const match = content.match(DUE_METADATA_PATTERN);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[1]) as Partial<StructuredDue> & { visibleDate?: string; visibleTime?: string };
    return normalizeStructuredDue({
      ...emptyDue('metadata'),
      ...raw,
      date: raw.visibleDate ?? raw.date ?? null,
      time: raw.visibleTime ?? raw.time ?? null,
      rawDate: raw.rawDate ?? raw.date ?? null,
      source: 'metadata',
    });
  } catch {
    return null;
  }
}

export function normalizeTodoistDue(due: TodoistDue | null): StructuredDue {
  if (!due) return emptyDue('todoist');

  const rawDate = due.datetime ?? due.date;
  const fixed = Boolean(due.timezone || /(?:Z|[+-]\d{2}:?\d{2})$/.test(rawDate));
  const hasTime = rawDate.includes('T');
  const local = fixed ? localDateTimeFromTimestamp(rawDate) : dateTimeParts(rawDate);
  const date = local?.date ?? datePrefix(rawDate);
  const time = local?.time ?? null;

  let kind: StructuredDue['kind'] = 'date';
  if (due.isRecurring) {
    kind = 'recurring';
  } else if (fixed) {
    kind = 'fixed';
  } else if (hasTime) {
    kind = 'floating';
  }

  return normalizeStructuredDue({
    kind,
    date,
    time,
    rawDate,
    timezone: due.timezone ?? null,
    string: due.string ?? null,
    lang: due.lang ?? null,
    isRecurring: due.isRecurring ?? false,
    source: 'todoist',
  });
}

export function normalizeStructuredDue(due: StructuredDue): StructuredDue {
  if (!due.date) {
    return {
      ...emptyDue(due.source),
      timezone: due.timezone ?? null,
      string: due.string ?? null,
      lang: due.lang ?? null,
      isRecurring: due.isRecurring ?? false,
    };
  }

  const time = due.time ? normalizeTime(due.time) : null;
  const kind = due.isRecurring ? 'recurring' : due.kind;
  return {
    kind,
    date: due.date,
    time,
    rawDate: due.rawDate ?? (time ? `${due.date}T${time}:00` : due.date),
    timezone: due.timezone ?? null,
    string: due.string ?? null,
    lang: due.lang ?? null,
    isRecurring: due.isRecurring ?? kind === 'recurring',
    source: due.source,
  };
}

export function formatDueForMarkdown(due: StructuredDue): string | null {
  if (!due.date) return null;
  return due.time ? `${due.date} ${due.time}` : due.date;
}

export function formatDueMetadata(due: StructuredDue): string | null {
  if (!requiresDueMetadata(due)) return null;
  const payload = {
    kind: due.kind,
    date: due.rawDate,
    visibleDate: due.date,
    visibleTime: due.time,
    timezone: due.timezone,
    string: due.string,
    lang: due.lang,
    isRecurring: due.isRecurring,
  };
  return `<!-- todoist-due:${JSON.stringify(payload)} -->`;
}

export function stripDueMetadata(content: string): string {
  return content.replace(DUE_METADATA_PATTERN, '');
}

export function requiresDueMetadata(due: StructuredDue): boolean {
  return due.kind === 'fixed' || due.kind === 'recurring' || Boolean(due.timezone || due.string || due.lang || due.isRecurring);
}

export function dueHash(due: StructuredDue): string {
  if (!due.date) return '';
  const preserved = due.kind === 'fixed' || due.kind === 'recurring'
    ? [due.rawDate ?? '', due.timezone ?? '', due.string ?? '', due.lang ?? '']
    : [];
  return [due.kind, due.date, due.time ?? '', due.isRecurring ? 'recurring' : 'one-time', ...preserved].join('|');
}

export function todoistDueUpdate(due: StructuredDue): { dueDate?: string; dueDatetime?: string } {
  if (!due.date || due.isRecurring || due.kind === 'fixed' || due.kind === 'recurring') return {};
  if (due.time) return { dueDatetime: `${due.date}T${due.time}:00` };
  return { dueDate: due.date };
}

export function canPushDueToTodoist(due: StructuredDue): boolean {
  return due.kind === 'date' || due.kind === 'floating';
}

export function dateOnlyFromDue(due: StructuredDue): string | null {
  return due.date;
}

function normalizeTime(value: string): string | null {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function dateTimeParts(value: string): { date: string; time: string | null } | null {
  const match = value.match(DATE_TIME_PATTERN);
  if (!match) return null;
  const time = match[2] && match[3] ? `${match[2].padStart(2, '0')}:${match[3]}` : null;
  return { date: match[1], time };
}

function localDateTimeFromTimestamp(value: string): { date: string; time: string | null } | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return dateTimeParts(value);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function datePrefix(value: string): string | null {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}
