import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { PagedResult } from '../models/paged-result';

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

export interface MeasurementSeriesGroupDto {
  seriesId: number;
  seriesName: string;
  measurementCount: number;
  latestMeasurementId: number;
  latestTemplateName: string;
  latestCreatedAt: string;
  templateNames: string[];
  authorNames: string[];
}

export interface SeriesGroupParams {
  page?: number;
  pageSize?: number;
  templateId?: number;
  dateFrom?: string;
  dateTo?: string;
  searchText?: string;
}

export interface CreateShareLinkPayload {
  expiresInDays: number;
  isPublic: boolean;
  allowedUserEmails?: string[];
}

export interface ShareLinkResponseDto {
  id: number;
  seriesId: number;
  seriesName: string;
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

export interface MyShareLinksParams {
  searchText?: string;
  status?: 'active' | 'inactive' | 'expired';
  visibility?: 'public' | 'private';
}

@Injectable({
  providedIn: 'root'
})
export class MeasurementSeriesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/measurementseries`;

  getSeriesPage(page = 1, pageSize = 20): Observable<PagedResult<MeasurementSeriesDto>> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<PagedResult<MeasurementSeriesDto>>(this.baseUrl, { params });
  }

  getSeriesGroups(p: SeriesGroupParams = {}): Observable<PagedResult<MeasurementSeriesGroupDto>> {
    let params = new HttpParams()
      .set('page', p.page ?? 1)
      .set('pageSize', p.pageSize ?? 10);
    if (p.templateId != null) params = params.set('templateId', p.templateId);
    if (p.dateFrom) params = params.set('dateFrom', p.dateFrom);
    if (p.dateTo) params = params.set('dateTo', p.dateTo);
    if (p.searchText) params = params.set('searchText', p.searchText);
    return this.http.get<PagedResult<MeasurementSeriesGroupDto>>(
      `${this.baseUrl}/grouped`,
      { params }
    );
  }

  getSeries(): Observable<MeasurementSeriesDto[]> {
    return this.getSeriesPage(1, 100).pipe(map((r) => r.items));
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

  getMyShareLinks(p: MyShareLinksParams = {}): Observable<ShareLinkResponseDto[]> {
    let params = new HttpParams();
    if (p.searchText) params = params.set('searchText', p.searchText);
    if (p.status) params = params.set('status', p.status);
    if (p.visibility) params = params.set('visibility', p.visibility);
    return this.http.get<ShareLinkResponseDto[]>(`${this.baseUrl}/shares/mine`, { params });
  }

  deleteShareLink(seriesId: number, shareId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${seriesId}/share/${shareId}`);
  }

  deactivateShareLink(seriesId: number, shareId: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${seriesId}/share/${shareId}/deactivate`, {});
  }

  reactivateShareLink(seriesId: number, shareId: number): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${seriesId}/share/${shareId}/reactivate`, {});
  }
}
