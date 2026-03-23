import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  onCreateMeasurement(): void {
    this.router.navigate(['/erstellen']);
  }

  onImport(): void {
    this.router.navigate(['/import']);
  }

  onTemplates(): void {
    this.router.navigate(['/templates']);
  }

  onExport(): void {
    this.router.navigate(['/exportieren']);
  }

  onProfileClick(): void {
    this.router.navigate(['/login']);
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
