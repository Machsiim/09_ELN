import { Component, inject, signal } from '@angular/core';
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
  readonly toolsMenuOpen = signal(false);

  onCreateMeasurement(): void {
    this.router.navigate(['/erstellen']);
  }

  onImport(): void {
    this.closeToolsMenu();
    this.router.navigate(['/import']);
  }

  onTemplates(): void {
    this.router.navigate(['/templates']);
  }

  onMigration(): void {
    this.closeToolsMenu();
    this.router.navigate(['/migration']);
  }

  onExport(): void {
    this.closeToolsMenu();
    this.router.navigate(['/exportieren']);
  }

  toggleToolsMenu(): void {
    this.toolsMenuOpen.update((open) => !open);
  }

  closeToolsMenu(): void {
    this.toolsMenuOpen.set(false);
  }

  onProfileClick(): void {
    this.router.navigate(['/login']);
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
