import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/startseite',
    pathMatch: 'full'
  },
  {
    path: 'startseite',
    loadComponent: () => import('./features/home/home').then(m => m.Home),
    title: 'Startseite - Biomedical Research Notebook'
  },
  {
    path: 'import',
    loadComponent: () => import('./features/import/import').then(m => m.Import),
    title: 'Datei importieren - Biomedical Research Notebook'
  },
  {
    path: 'erstellen',
    loadComponent: () => import('./features/create-measurement/create-measurement').then(m => m.CreateMeasurement),
    title: 'Messung erstellen - Biomedical Research Notebook'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
    title: 'Dashboard - Biomedical Research Notebook'
  },
  {
    path: 'messungen',
    loadComponent: () => import('./features/measurements/measurements').then(m => m.Measurements),
    title: 'Messungen - Biomedical Research Notebook'
  },
  {
    path: 'messungen/serie/:id',
    loadComponent: () => import('./features/measurement-series-detail/measurement-series-detail').then(m => m.MeasurementSeriesDetail),
    title: 'Messserie Details - Biomedical Research Notebook'
  },
  {
    path: 'templates',
    loadComponent: () => import('./features/templates/templates').then(m => m.Templates),
    title: 'Templates - Biomedical Research Notebook'
  },
  {
    path: '**',
    redirectTo: '/startseite'
  }
];
