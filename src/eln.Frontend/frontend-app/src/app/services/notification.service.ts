import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly message = signal<string | null>(null);
  readonly type = signal<NotificationType>('success');
  private timeout: number | null = null;

  show(message: string, duration = 4000): void {
    this.type.set('success');
    this.message.set(message);
    this.resetTimeout(duration);
  }

  showError(message: string, duration = 5000): void {
    this.type.set('error');
    this.message.set(message);
    this.resetTimeout(duration);
  }

  dismiss(): void {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.message.set(null);
  }

  private resetTimeout(duration: number): void {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }
    this.timeout = window.setTimeout(() => {
      this.message.set(null);
      this.timeout = null;
    }, duration);
  }
}
