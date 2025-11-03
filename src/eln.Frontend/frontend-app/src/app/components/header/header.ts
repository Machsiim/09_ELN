import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  onImport(): void {
    window.location.href = '/import';
  }

  onExport(): void {
    console.log('Export clicked');
  }

  onProfileClick(): void {
    console.log('Profile clicked');
  }
}
