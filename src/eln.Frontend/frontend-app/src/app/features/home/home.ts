import { Component } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';

@Component({
  selector: 'app-home',
  imports: [Header, Footer],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  navigateToImport(): void {
    window.location.href = '/import';
  }

  navigateToDashboard(): void {
    window.location.href = '/dashboard';
  }
}
