import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

@Injectable({
  providedIn: 'root'
})
export class MeasurementService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/measurements`;

  createMeasurement(payload: CreateMeasurementPayload): Observable<MeasurementResponseDto> {
    return this.http.post<MeasurementResponseDto>(this.baseUrl, payload);
  }
}
