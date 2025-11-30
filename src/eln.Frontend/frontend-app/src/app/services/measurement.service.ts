import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MeasurementResponseDto {
  id: number;
  seriesId: number;
  seriesName: string;
  templateId: number;
  templateName: string;
  data: Record<string, Record<string, unknown>>;
  createdBy: number;
  createdByUsername: string;
  createdAt: string;
}

export interface CreateMeasurementPayload {
  seriesId: number;
  templateId: number;
  data: Record<string, Record<string, unknown>>;
}

export interface MeasurementListItem {
  id: number;
  seriesId: number;
  seriesName: string;
  templateName: string;
  createdByUsername: string;
  createdAt: string;
}

export interface MeasurementSearchParams {
  templateId?: number;
  seriesId?: number;
  dateFrom?: string;
  dateTo?: string;
  searchText?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MeasurementService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/measurements`;

  createMeasurement(payload: CreateMeasurementPayload): Observable<MeasurementResponseDto> {
    return this.http.post<MeasurementResponseDto>(this.baseUrl, payload);
  }

  searchMeasurements(params: MeasurementSearchParams = {}): Observable<MeasurementListItem[]> {
    let httpParams = new HttpParams();

    if (params.templateId) {
      httpParams = httpParams.set('templateId', params.templateId);
    }

    if (params.seriesId) {
      httpParams = httpParams.set('seriesId', params.seriesId);
    }

    if (params.dateFrom) {
      httpParams = httpParams.set('dateFrom', params.dateFrom);
    }

    if (params.dateTo) {
      httpParams = httpParams.set('dateTo', params.dateTo);
    }

    if (params.searchText && params.searchText.trim().length > 0) {
      httpParams = httpParams.set('searchText', params.searchText.trim());
    }

    return this.http.get<MeasurementListItem[]>(`${this.baseUrl}/search`, {
      params: httpParams
    });
  }
}
