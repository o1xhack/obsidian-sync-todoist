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
