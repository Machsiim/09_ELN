import { Component, signal } from '@angular/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-import',
  imports: [FormsModule, Header, Footer],
  templateUrl: './import.html',
  styleUrl: './import.scss',
})
export class Import {
  selectedTemplate = '';
  selectedFile = signal<File | null>(null);
  dragOver = signal(false);

  constructor(private router: Router) { }

  isDragOver(): boolean {
    return this.dragOver();
  }

  onTemplateChange(): void {
    console.log('Template selected:', this.selectedTemplate);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile.set(files[0]);
    }
  }

  removeFile(): void {
    this.selectedFile.set(null);
  }

  canProceed(): boolean {
    return this.selectedTemplate !== '' && this.selectedFile() !== null;
  }

  onUpload(): void {
    if (this.canProceed()) {
      console.log('Uploading file:', this.selectedFile()?.name);
      console.log('Using template:', this.selectedTemplate);
    }
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }
}
