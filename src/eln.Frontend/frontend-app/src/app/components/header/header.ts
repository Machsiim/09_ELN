import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [RouterModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
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
    console.log('Profile clicked');
  }
}
