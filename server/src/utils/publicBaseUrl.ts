const REPORT_BASE_ENV_KEYS = [
  'REPORTS_BASE_URL',
  'RENDER_EXTERNAL_URL',
  'BACKEND_URL',
  'API_BASE_URL',
  'APP_BASE_URL',
  'FRONTEND_URL',
] as const;

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

export const getPublicBaseUrl = () => {
  for (const envKey of REPORT_BASE_ENV_KEYS) {
    const configuredBaseUrl = normalizeBaseUrl(String(process.env[envKey] || ''));
    if (configuredBaseUrl) {
      return configuredBaseUrl;
    }
  }

  return `http://localhost:${process.env.PORT || '3000'}`;
};
