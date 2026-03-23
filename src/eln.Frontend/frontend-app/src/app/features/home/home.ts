import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';

@Component({
  selector: 'app-home',
  imports: [Header, Footer],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly router = inject(Router);

  navigateToCreate(): void {
    this.router.navigate(['/erstellen']);
  }

  navigateToImport(): void {
    this.router.navigate(['/import']);
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
