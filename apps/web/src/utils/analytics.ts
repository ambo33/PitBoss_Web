type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== '')
  );
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env;
  if (env?.DEV) {
    console.debug('[analytics]', name, safeProperties);
  }
  window.dispatchEvent(new CustomEvent('pokerplanner:analytics', { detail: { name, properties: safeProperties } }));
}
