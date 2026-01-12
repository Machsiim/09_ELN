import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.Login),
    title: 'Anmelden - Biomedical Research Notebook'
  },
  {
    path: 'startseite',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
    title: 'Startseite - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'import',
    loadComponent: () => import('./features/import/import').then(m => m.Import),
    title: 'Datei importieren - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'erstellen',
    loadComponent: () => import('./features/create-measurement/create-measurement').then(m => m.CreateMeasurement),
    title: 'Messung erstellen - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
    title: 'Dashboard - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'messungen',
    loadComponent: () => import('./features/measurements/measurements').then(m => m.Measurements),
    title: 'Messungen - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'messungen/serie/:id',
    loadComponent: () => import('./features/measurement-series-detail/measurement-series-detail').then(m => m.MeasurementSeriesDetail),
    title: 'Messserie Details - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'messungen/serie/:seriesId/:measurementId',
    loadComponent: () => import('./features/measurement-detail/measurement-detail').then(m => m.MeasurementDetail),
    title: 'Messung - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'templates',
    loadComponent: () => import('./features/templates/templates').then(m => m.Templates),
    title: 'Templates - Biomedical Research Notebook',
    canActivate: [authGuard]
  },
  {
    path: 'shared/:token',
    loadComponent: () => import('./features/shared-series/shared-series').then(m => m.SharedSeries),
    title: 'Geteilte Messserie - Biomedical Research Notebook'
  },
  {
    path: '**',
    redirectTo: '/login'
  }
];
