import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly message = signal<string | null>(null);
  private timeout: number | null = null;

  show(message: string, duration = 4000): void {
    this.message.set(message);
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
    this.timeout = window.setTimeout(() => {
      this.message.set(null);
      this.timeout = null;
    }, duration);
  }

  dismiss(): void {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.message.set(null);
  }
}
