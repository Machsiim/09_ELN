import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface VisualizableFieldDto {
  key: string;
  label: string;
  type: string;
  section: string;
  templateName: string;
}

export interface TimelineDatasetDto {
  field: string;
  section: string;
  values: (number | null)[];
}

export interface TimelineDto {
  labels: string[];
  datasets: TimelineDatasetDto[];
}

export interface BucketDto {
  min: number;
  max: number;
  count: number;
}

export interface DistributionDto {
  field: string;
  section: string;
  values: number[];
  buckets: BucketDto[];
}

@Injectable({ providedIn: 'root' })
export class VisualizationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/visualization`;

  getFields(seriesId: number): Observable<VisualizableFieldDto[]> {
    return this.http.get<VisualizableFieldDto[]>(`${this.baseUrl}/series/${seriesId}/fields`);
  }

  getTimeline(seriesId: number): Observable<TimelineDto> {
    return this.http.get<TimelineDto>(`${this.baseUrl}/series/${seriesId}/timeline`);
  }

  getDistribution(seriesId: number, field: string, section?: string): Observable<DistributionDto> {
    let params = new HttpParams().set('field', field);
    if (section) {
      params = params.set('section', section);
    }
    return this.http.get<DistributionDto>(
      `${this.baseUrl}/series/${seriesId}/distribution`,
      { params }
    );
  }
}
