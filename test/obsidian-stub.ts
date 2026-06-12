export class Notice {
  message: string;
  duration: number;

  constructor(message: string, duration = 5000) {
    this.message = message;
    this.duration = duration;
  }

  setMessage(message: string): void {
    this.message = message;
  }

  hide(): void {
    this.duration = 0;
  }
}

export class App {}

export class TFile {
  path: string;
  stat: { mtime: number };

  constructor(path: string) {
    this.path = path;
    this.stat = { mtime: Date.now() };
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}

export function moment(value: string, format: string): { isValid: () => boolean; format: (nextFormat: string) => string } {
  const valid = format === 'YYYY-MM-DD' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return {
    isValid: () => valid,
    format: (nextFormat: string) => {
      if (!valid) return 'Invalid date';
      if (nextFormat === 'YYYY-MM-DD') return value;
      return nextFormat
        .replace('YYYY', value.slice(0, 4))
        .replace('MM', value.slice(5, 7))
        .replace('DD', value.slice(8, 10));
    },
  };
}

export const Platform = {
  isMobile: false,
};

type RequestUrlHandler = (options: unknown) => unknown | Promise<unknown>;

let requestUrlHandler: RequestUrlHandler | null = null;

export function setRequestUrlHandler(handler: RequestUrlHandler | null): void {
  requestUrlHandler = handler;
}

export function requestUrl(options: unknown): unknown | Promise<unknown> {
  if (requestUrlHandler) return requestUrlHandler(options);
  throw new Error('requestUrl is not available in tests');
}
