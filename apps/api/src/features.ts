export type FeatureName = 'tvBoard';

export function isFeatureEnabled(_feature: FeatureName): boolean {
  // Ready for VIP gating later. For now, the feature is enabled globally.
  return true;
}
