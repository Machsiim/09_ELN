import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './components/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  template: `
    <router-outlet></router-outlet>
    <app-toast />
  `,
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend-app');
}
