declare const SYNC_TODOIST_VERSION: string;
declare const SYNC_TODOIST_BUILD_DATE: string;
declare const SYNC_TODOIST_BUILD_NUMBER: string;

export interface BuildInfo {
  version: string;
  buildDate: string;
  buildNumber: string;
}

export function getBuildInfo(): BuildInfo {
  return {
    version: SYNC_TODOIST_VERSION,
    buildDate: SYNC_TODOIST_BUILD_DATE,
    buildNumber: SYNC_TODOIST_BUILD_NUMBER,
  };
}

export function formatBuildDate(buildDate: string): string {
  const date = new Date(buildDate);
  if (Number.isNaN(date.getTime())) return buildDate;
  return date.toLocaleString();
}
