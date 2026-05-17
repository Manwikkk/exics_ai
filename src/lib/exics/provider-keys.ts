import { MODELS, type ApiKeys, type ProviderId, type ProviderKeyStatus } from "./types";

export const API_KEY_MESSAGES = {
  noneConfigured:
    "Add at least one API key in Settings to continue.",
  providerRequired: (providerName: string) =>
    `Add an API key for ${providerName} in Settings to use this model.`,
} as const;

export interface ProviderKeyContext {
  apiKeys: ApiKeys;
  groqDefaultDisabled: boolean;
  providerStatus?: Record<ProviderId, ProviderKeyStatus> | null;
}

/** Whether this provider can be used (local key, server default for Groq, or synced DB key). */
export function hasProviderKey(
  provider: ProviderId,
  ctx: ProviderKeyContext,
): boolean {
  if (ctx.apiKeys[provider]?.trim()) return true;

  const server = ctx.providerStatus?.[provider];
  if (provider === "groq") {
    if (ctx.groqDefaultDisabled) return false;
    return server?.default_available ?? true;
  }
  return !!server?.configured;
}

export function hasAnyProviderKey(ctx: ProviderKeyContext): boolean {
  return MODELS.some((m) => hasProviderKey(m.id, ctx));
}

export function providerDisplayName(provider: ProviderId): string {
  return MODELS.find((m) => m.id === provider)?.name ?? provider;
}

export function resolveClientApiKey(
  provider: ProviderId,
  apiKeys: ApiKeys,
): string | undefined {
  const key = apiKeys[provider]?.trim();
  return key || undefined;
}
