import { Component, input, inject, signal } from '@angular/core';
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
  readonly userMenuOpen = signal(false);
  readonly publicMode = input(false);

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
    this.userMenuOpen.set(false);
    this.toolsMenuOpen.update((open) => !open);
  }

  closeToolsMenu(): void {
    this.toolsMenuOpen.set(false);
  }

  toggleUserMenu(): void {
    this.toolsMenuOpen.set(false);
    this.userMenuOpen.update((open) => !open);
  }

  onSharedLinks(): void {
    this.userMenuOpen.set(false);
    this.router.navigate(['/geteilte-links']);
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
