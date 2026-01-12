import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ImageResponseDto {
  id: number;
  measurementId: number;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  uploadedBy: number;
  uploadedByUsername: string;
  uploadedAt: string;
  url: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/images`;

  getImagesForMeasurement(measurementId: number): Observable<ImageResponseDto[]> {
    return this.http.get<ImageResponseDto[]>(`${this.baseUrl}/measurement/${measurementId}`);
  }

  uploadImage(measurementId: number, file: File): Observable<ImageResponseDto> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ImageResponseDto>(`${this.baseUrl}/measurement/${measurementId}`, formData);
  }

  deleteImage(imageId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${imageId}`);
  }

  getImageUrl(imageId: number): string {
    return `${environment.apiUrl.replace(/\/$/, '')}/images/${imageId}`;
  }
}
