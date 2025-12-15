import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  readonly authService = inject(AuthService);

  onCreateMeasurement(): void {
    window.location.href = '/erstellen';
  }

  onImport(): void {
    window.location.href = '/import';
  }

  onTemplates(): void {
    window.location.href = '/templates';
  }

  onExport(): void {
    console.log('Export clicked');
  }

  onProfileClick(): void {
    window.location.href = '/login';
  }

  onLogout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }
}
