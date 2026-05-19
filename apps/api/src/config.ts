const localClientUrl = 'http://localhost:5173';
const productionAppUrl = 'https://app.pokerplanner.bet';
const productionPublicUrl = 'https://pokerplanner.bet';

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
