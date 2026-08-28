export type FeatureName = 'tvBoard' | 'deferredAuthQuickStart';

export function isFeatureEnabled(feature: FeatureName): boolean {
  if (feature === 'deferredAuthQuickStart') {
    return process.env.DEFERRED_AUTH_QUICK_START === 'true' || process.env.NODE_ENV !== 'production';
  }
  // Ready for VIP gating later. For now, the TV board is enabled globally.
  return true;
}
