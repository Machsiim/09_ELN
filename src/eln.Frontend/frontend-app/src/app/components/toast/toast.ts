import { Component, inject } from '@angular/core';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    @if (notification.message()) {
      <div class="toast" [class.toast-success]="notification.type() === 'success'" [class.toast-error]="notification.type() === 'error'">
        {{ notification.message() }}
      </div>
    }
  `,
  styleUrl: './toast.scss'
})
export class Toast {
  protected readonly notification = inject(NotificationService);
}
