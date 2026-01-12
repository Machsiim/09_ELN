import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface MeasurementSeriesDto {
  id: number;
  name: string;
  description?: string | null;
  createdBy: number;
  createdByUsername: string;
  createdAt: string;
  measurementCount: number;
  // Lock information
  isLocked: boolean;
  lockedBy?: number | null;
  lockedByUsername?: string | null;
  lockedAt?: string | null;
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
  private readonly authService = inject(AuthService);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/measurementseries`;

  getSeries(): Observable<MeasurementSeriesDto[]> {
    return this.http.get<MeasurementSeriesDto[]>(this.baseUrl).pipe(
      map(series => this.filterSeriesByRole(series))
    );
  }

  private filterSeriesByRole(series: MeasurementSeriesDto[]): MeasurementSeriesDto[] {
    const currentUser = this.authService.currentUser();

    if (!currentUser) {
      return [];
    }

    if (this.authService.isStaff()) {
      return series;
    }

    return series.filter(s => s.createdByUsername === currentUser.username);
  }

  createSeries(payload: CreateMeasurementSeriesDto): Observable<MeasurementSeriesDto> {
    return this.http.post<MeasurementSeriesDto>(this.baseUrl, payload);
  }

  getSeriesById(id: number): Observable<MeasurementSeriesDto> {
    return this.http.get<MeasurementSeriesDto>(`${this.baseUrl}/${id}`);
  }

  lockSeries(id: number): Observable<MeasurementSeriesDto> {
    return this.http.put<MeasurementSeriesDto>(`${this.baseUrl}/${id}/lock`, {});
  }

  unlockSeries(id: number): Observable<MeasurementSeriesDto> {
    return this.http.put<MeasurementSeriesDto>(`${this.baseUrl}/${id}/unlock`, {});
  }
}
