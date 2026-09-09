import type { ArenaState } from './arena';
export type LiveUpdate = ArenaState & {
  delta?: boolean;
  replaceRecent?: boolean;
};
export function liveUpdate(
  current: ArenaState,
  previous?: ArenaState,
  forceReset = false,
): LiveUpdate {
  const reset =
    forceReset ||
    !previous ||
    current.mode !== previous.mode ||
    current.match?.openedAt !== previous.match?.openedAt ||
    !current.recent.length;
  const seen = new Set(previous?.recent.map((v) => v.id));
  return {
    ...current,
    delta: true,
    replaceRecent: reset,
    recent: reset
      ? current.recent
      : current.recent.filter((v) => !seen.has(v.id)),
  };
}
export function mergeLiveUpdate(
  previous: ArenaState,
  incoming: LiveUpdate,
): ArenaState {
  const { delta, replaceRecent, ...state } = incoming;
  if (!delta || replaceRecent) return state;
  if (!incoming.recent.length) return { ...state, recent: previous.recent };
  const ids = new Set(incoming.recent.map((v) => v.id));
  return {
    ...state,
    recent: [
      ...incoming.recent,
      ...previous.recent.filter((v) => !ids.has(v.id)),
    ].slice(0, 500),
  };
}
