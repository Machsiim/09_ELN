import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MeasurementSeriesDto {
  id: number;
  name: string;
  description?: string | null;
  createdBy: number;
  createdByUsername: string;
  createdAt: string;
  measurementCount: number;
}

export interface CreateMeasurementSeriesDto {
  name: string;
  description?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class MeasurementSeriesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/measurementseries`;

  getSeries(): Observable<MeasurementSeriesDto[]> {
    return this.http.get<MeasurementSeriesDto[]>(this.baseUrl);
  }

  createSeries(payload: CreateMeasurementSeriesDto): Observable<MeasurementSeriesDto> {
    return this.http.post<MeasurementSeriesDto>(this.baseUrl, payload);
  }
}
