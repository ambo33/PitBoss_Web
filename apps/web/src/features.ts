export const featureFlags = {
  tvBoard: true,
  deferredAuthQuickStart:
    ((import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> }).env?.VITE_DEFERRED_AUTH_QUICK_START === 'true')
    || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname),
} as const;
