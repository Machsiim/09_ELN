const runtimeApiUrl =
  typeof window !== 'undefined'
    ? (window as typeof window & { __elnApiUrl?: string }).__elnApiUrl
    : undefined;

const defaultApiUrl = (() => {
  if (typeof window === 'undefined') {
    return 'http://localhost:5100/api';
  }

  const { hostname, port, protocol } = window.location;
  const isDevPort = port === '4200' || port === '8080';

  if (isDevPort) {
    const targetHost = hostname || 'localhost';
    const scheme = protocol.startsWith('https') ? 'https' : 'http';
    return `${scheme}://${targetHost}:5100/api`;
  }

  return `${window.location.origin}/api`;
})();

const defaultPythonApiUrl = 'http://localhost:8001';

export const environment = {
  production: false,
  apiUrl: runtimeApiUrl ?? defaultApiUrl,
  pythonApiUrl: defaultPythonApiUrl
};
