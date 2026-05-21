const localClientUrl = 'http://localhost:5173';
const productionAppUrl = 'https://app.thepokerplanner.com';
const productionPublicUrl = 'https://thepokerplanner.com';
const productionClientUrls = [
  productionAppUrl,
  productionPublicUrl,
  'https://www.thepokerplanner.com',
  'https://app.pokerplanner.bet',
  'https://pokerplanner.bet',
  'https://www.pokerplanner.bet',
];

function cleanUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isHostedRuntime(): boolean {
  return Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
}

export function getClientUrl(): string {
  return cleanUrl(process.env.CLIENT_URL ?? process.env.APP_URL ?? (isHostedRuntime() ? productionAppUrl : localClientUrl));
}

export function getAllowedClientUrls(): string[] {
  const configured = process.env.CLIENT_URLS ?? process.env.ALLOWED_ORIGINS;
  const urls = configured
    ? configured.split(',').map((value) => cleanUrl(value.trim())).filter(Boolean)
    : (isHostedRuntime() ? productionClientUrls : [localClientUrl]);
  return Array.from(new Set(urls));
}

export function getAppUrl(): string {
  return cleanUrl(process.env.APP_URL ?? process.env.CLIENT_URL ?? (isHostedRuntime() ? productionAppUrl : localClientUrl));
}

export function getPublicUrl(): string {
  return cleanUrl(process.env.PUBLIC_URL ?? (isHostedRuntime() ? productionPublicUrl : getAppUrl()));
}
