import { initialState, type ArenaState } from '../lib/arena.ts';
import { subscriberLedgerForStream, type SubscriberLedger } from '../lib/subscribers.ts';
import type { ArenaDatabase, SavedArena } from './database.ts';

export function prepareConnection(database: ArenaDatabase, input: {
  video: string; previousVideo: string; owner: string; previousOwner: string;
  choice?: 'continue' | 'fresh'; live: ArenaState; ledger?: SubscriberLedger;
}, now = Date.now()) {
  const { video, previousVideo, choice } = input;
  const restored = database.loadLive(video);
  const replacement = video !== previousVideo && !restored;
  if (replacement && previousVideo && !choice)
    throw new Error('Choose Continue previous session or Start fresh for this new stream.');
  const continuing = replacement && !!previousVideo && choice === 'continue';
  if (continuing && (!input.owner || input.owner !== input.previousOwner))
    throw new Error('Continue the session using a stream from the same YouTube channel.');
  const savedLedger = database.get<SubscriberLedger>('ledger:' + database.sessionFor(video));
  const ledger = continuing ? input.ledger : restored ? savedLedger ?? (video === previousVideo ? input.ledger : undefined) : input.ledger;
  return {
    state: { ...(continuing ? input.live : restored ?? initialState()), mode: 'live' as const,
      connected: false, subscriberAlerts: [] },
    ledger: (continuing || !!savedLedger) && ledger ? { ...ledger, streamId: video } : subscriberLedgerForStream(ledger, video, now),
    resume: replacement ? undefined : database.get<{ resume?: SavedArena['resume'] }>('checkpoint:' + video)?.resume,
    continuing,
  };
}
