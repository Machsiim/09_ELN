import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  DistributionDto,
  TimelineDto,
  VisualizableFieldDto
} from './visualization.service';

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

  getVisualizationFields(token: string): Observable<VisualizableFieldDto[]> {
    return this.http.get<VisualizableFieldDto[]>(
      `${this.baseUrl}/${token}/visualization/fields`
    );
  }

  getVisualizationTimeline(token: string): Observable<TimelineDto> {
    return this.http.get<TimelineDto>(
      `${this.baseUrl}/${token}/visualization/timeline`
    );
  }

  getVisualizationDistribution(
    token: string,
    field: string,
    section?: string,
    bins?: number
  ): Observable<DistributionDto> {
    let params = new HttpParams().set('field', field);
    if (section) params = params.set('section', section);
    if (bins != null) params = params.set('bins', String(bins));

    return this.http.get<DistributionDto>(
      `${this.baseUrl}/${token}/visualization/distribution`,
      { params }
    );
  }
}
