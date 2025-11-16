const runtimeApiUrl =
  typeof window !== 'undefined'
    ? (window as typeof window & { __elnApiUrl?: string }).__elnApiUrl
    : undefined;

const defaultApiUrl =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api`
    : 'http://localhost:5080/api';

export const environment = {
  production: false,
  apiUrl: runtimeApiUrl ?? defaultApiUrl
};
