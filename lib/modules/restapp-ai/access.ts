import 'server-only';

import { getTeamModuleAccess } from '@/lib/modules/module-access';
import {
  resolveTeamAiEngine,
  resolveTeamChannelStatus,
} from '@/lib/modules/ops-readiness/engine';
import { getRestappSettings, isRestappActive } from './db';

// Re-export shared SaaS resolvers (single source of truth)
export { resolveTeamAiEngine, resolveTeamChannelStatus };

/**
 * Single source of truth for RestaPP AI runtime access.
 * UI, automation validation and intelligence bridge must use this.
 */
export async function getRestappAccess(teamId: number) {
  const [settings, access, aiEngine, channel] = await Promise.all([
    getRestappSettings(teamId).catch(() => null),
    getTeamModuleAccess(teamId).catch(() => null),
    resolveTeamAiEngine(teamId).catch(() => ({
      ready: false,
      source: 'none' as const,
      statusLabel: 'Motor inteligente no disponible',
    })),
    resolveTeamChannelStatus(teamId).catch(() => ({
      connected: false,
      count: 0,
      phoneHint: null as string | null,
      statusLabel: 'Canal no disponible',
    })),
  ]);

  const teamActive = Boolean(access?.isTeamAccessActive);
  const planAllows = true;
  const moduleOn = Boolean(settings?.is_active);
  const setupOk = Boolean(
    settings?.setup_completed && String(settings?.restaurant_name || '').trim()
  );
  const agentEnabled = Boolean(settings?.agent_enabled);
  const aiReady = Boolean(aiEngine.ready);
  const channelConnected = Boolean(channel.connected);

  const agentOn = Boolean(moduleOn && setupOk && agentEnabled && aiReady && teamActive);
  const runtimeActive = Boolean(teamActive && planAllows && moduleOn && agentEnabled && setupOk);
  const opsReady = Boolean(runtimeActive && aiReady && channelConnected);

  return {
    teamActive,
    planAllows,
    moduleOn,
    setupOk,
    agentEnabled,
    agentOn,
    aiReady,
    aiEngine,
    channelConnected,
    channel,
    betaMode: settings?.beta_mode !== false,
    settings,
    providerMode: 'inherit' as const,
    runtimeActive,
    opsReady,
    canConfigure: Boolean(teamActive && planAllows),
  };
}

export async function assertRestappRuntime(teamId: number) {
  const a = await getRestappAccess(teamId);
  if (!a.runtimeActive) {
    throw new Error('restapp_runtime_inactive');
  }
  return a;
}

export { isRestappActive };
