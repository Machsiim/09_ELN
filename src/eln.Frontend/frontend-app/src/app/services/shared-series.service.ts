import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SharedSeriesDto {
  seriesId: number;
  seriesName: string;
  seriesDescription?: string | null;
  seriesCreatedAt: string;
  createdByUsername: string;
  expiresAt: string;
  measurements: SharedMeasurementDto[];
}

export interface SharedMeasurementDto {
  id: number;
  templateName: string;
  data: Record<string, Record<string, unknown>>;
  createdAt: string;
  createdByUsername: string;
}

@Injectable({
  providedIn: 'root'
})
export class SharedSeriesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/shared`;

  getSharedSeries(token: string): Observable<SharedSeriesDto> {
    return this.http.get<SharedSeriesDto>(`${this.baseUrl}/${token}`);
  }
}
