import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  exportSeriesAsExcel(seriesId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export/series/${seriesId}/excel`, {
      responseType: 'blob'
    });
  }

  exportSeriesAsCsv(seriesId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export/series/${seriesId}/csv`, {
      responseType: 'blob'
    });
  }

  exportMeasurementAsCsv(measurementId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export/measurements/${measurementId}/csv`, {
      responseType: 'blob'
    });
  }
}
