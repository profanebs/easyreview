export const agents = ['codex', 'opencode', 'kiro', 'cursor', 'dsh', 'manual'] as const;
export type Agent = typeof agents[number];

export function resolveAgent(value = 'auto', env: Record<string, string | undefined> = process.env): Agent {
  if (value !== 'auto') {
    if (!agents.includes(value as Agent)) throw new Error('agent: auto | codex | opencode | kiro | cursor | dsh | manual');
    return value as Agent;
  }
  if (env.EASYREVIEW_AGENT && agents.includes(env.EASYREVIEW_AGENT as Agent)) return env.EASYREVIEW_AGENT as Agent;
  if (env.OPENCODE_SESSION_ID) return 'opencode';
  if (env.CODEX_THREAD_ID) return 'codex';
  // Kiro exposes its session id to the commands it runs (verified on a real Kiro session).
  // dsh has no confirmed signal yet: select it with --agent dsh or EASYREVIEW_AGENT=dsh.
  if (env.KIRO_SESSION_ID) return 'kiro';
  // Native skill adapters identify their host explicitly. Unknown hosts use
  // the same local inbox, without guessing or reading global user settings.
  return 'manual';
}
