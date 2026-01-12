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

export interface CreateShareLinkPayload {
  expiresInDays: number;
  isPublic: boolean;
  allowedUserEmails?: string[];
}

export interface ShareLinkResponseDto {
  id: number;
  token: string;
  shareUrl: string;
  isPublic: boolean;
  allowedUserEmails: string[];
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  createdBy: number;
  createdByUsername: string;
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

  createShareLink(seriesId: number, payload: CreateShareLinkPayload): Observable<ShareLinkResponseDto> {
    return this.http.post<ShareLinkResponseDto>(`${this.baseUrl}/${seriesId}/share`, payload);
  }

  getShareLinks(seriesId: number): Observable<ShareLinkResponseDto[]> {
    return this.http.get<ShareLinkResponseDto[]>(`${this.baseUrl}/${seriesId}/shares`);
  }

  deleteShareLink(seriesId: number, shareId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${seriesId}/share/${shareId}`);
  }

  deactivateShareLink(seriesId: number, shareId: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${seriesId}/share/${shareId}/deactivate`, {});
  }
}
