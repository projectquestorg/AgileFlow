"use client";

import { useState, useCallback, useMemo } from "react";
import {
  IRSource,
  ProviderInfo,
  PROVIDER_INFO,
  DEFAULT_CAPABILITIES,
  getFeatureFlags,
  FeatureFlags,
  CapabilityName,
} from "@/lib/protocol";

interface UseProviderReturn {
  /** Currently selected provider */
  provider: IRSource;

  /** Provider info (name, icon, etc.) */
  providerInfo: ProviderInfo;

  /** All available providers */
  providers: ProviderInfo[];

  /** Feature flags for current provider */
  features: FeatureFlags;

  /** Select a different provider */
  selectProvider: (id: IRSource) => void;

  /** Check if provider has a capability */
  hasCapability: (capability: CapabilityName) => boolean;

  /** Check if a feature is available */
  canUse: (feature: keyof FeatureFlags) => boolean;
}

/**
 * Hook for managing CLI provider selection and capabilities
 */
export function useProvider(initialProvider: IRSource = "claude"): UseProviderReturn {
  const [provider, setProvider] = useState<IRSource>(initialProvider);

  // Build provider info list
  const providers = useMemo<ProviderInfo[]>(() => {
    return (Object.keys(PROVIDER_INFO) as IRSource[]).map((id) => ({
      ...PROVIDER_INFO[id],
      status: "ready" as const, // TODO: Get actual status from connection
      available: true,          // TODO: Check actual availability
      capabilities: DEFAULT_CAPABILITIES[id] || [],
    }));
  }, []);

  // Current provider info
  const providerInfo = useMemo<ProviderInfo>(() => {
    return providers.find(p => p.id === provider) || providers[0];
  }, [providers, provider]);

  // Feature flags for current provider
  const features = useMemo<FeatureFlags>(() => {
    return getFeatureFlags(provider);
  }, [provider]);

  // Select provider
  const selectProvider = useCallback((id: IRSource) => {
    setProvider(id);
  }, []);

  // Check capability
  const hasCapability = useCallback((capability: CapabilityName): boolean => {
    return providerInfo.capabilities.includes(capability);
  }, [providerInfo.capabilities]);

  // Check feature flag
  const canUse = useCallback((feature: keyof FeatureFlags): boolean => {
    return features[feature];
  }, [features]);

  return {
    provider,
    providerInfo,
    providers,
    features,
    selectProvider,
    hasCapability,
    canUse,
  };
}
