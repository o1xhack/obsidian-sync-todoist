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
