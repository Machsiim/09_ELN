import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PagedResult } from '../models/paged-result';

export type ActivityType =
  | 'MeasurementCreated'
  | 'MeasurementUpdated'
  | 'MeasurementDeleted'
  | 'SeriesCreated'
  | 'TemplateCreated';

export interface ActivityDto {
  type: ActivityType;
  description: string;
  timestamp: string;
  username: string;
  entityId: number;
  entityType: string;
  seriesId?: number | null;
  seriesName?: string | null;
}

export interface ActivityQuery {
  page?: number;
  pageSize?: number;
  type?: ActivityType;
  userId?: number;
}

@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl.replace(/\/$/, '')}/activities`;

  getActivities(query: ActivityQuery = {}): Observable<PagedResult<ActivityDto>> {
    let params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('pageSize', query.pageSize ?? 20);

    if (query.type) {
      params = params.set('type', query.type);
    }
    if (query.userId != null) {
      params = params.set('userId', query.userId);
    }

    return this.http.get<PagedResult<ActivityDto>>(this.baseUrl, { params });
  }
}
