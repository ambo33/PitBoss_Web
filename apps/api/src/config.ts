const localClientUrl = 'http://localhost:5173';
const productionAppUrl = 'https://app.thepokerplanner.com';
const productionPublicUrl = 'https://thepokerplanner.com';

function cleanUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isHostedRuntime(): boolean {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
}

export function getClientUrl(): string {
  return cleanUrl(process.env.CLIENT_URL ?? process.env.APP_URL ?? (isHostedRuntime() ? productionAppUrl : localClientUrl));
}

export function getAppUrl(): string {
  return cleanUrl(process.env.APP_URL ?? process.env.CLIENT_URL ?? (isHostedRuntime() ? productionAppUrl : localClientUrl));
}

export function getPublicUrl(): string {
  return cleanUrl(process.env.PUBLIC_URL ?? (isHostedRuntime() ? productionPublicUrl : getAppUrl()));
}

export function getAllowedClientUrls(): string[] {
  const configuredUrls = process.env.ALLOWED_CLIENT_URLS ?? process.env.ALLOWED_ORIGINS ?? '';
  const defaults = [
    localClientUrl,
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',
    productionAppUrl,
    productionPublicUrl,
    'https://app.pokerplanner.bet',
    'https://pokerplanner.bet',
    'https://www.thepokerplanner.com',
  ];

  return Array.from(new Set(
    [...configuredUrls.split(','), getClientUrl(), getAppUrl(), getPublicUrl(), ...defaults]
      .map((url) => url.trim())
      .filter(Boolean)
      .map(cleanUrl),
  ));
}
