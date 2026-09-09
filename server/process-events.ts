import { acceptVote, copyForBatch, type ArenaState } from '../lib/arena.ts';
import type { ChatBatch } from './chat-stream.ts';
import type { Analytics } from './analytics.ts';

// Called inside the same database transaction as the saved runtime/checkpoint.
export function processEvents(
  analytics: Analytics,
  stream: string,
  state: ArenaState,
  batch: ChatBatch,
  voteSince: number,
  streamSince: number,
  now = Date.now(),
) {
  const next = copyForBatch(state),
    seen = new Set(state.seen);
  let accepted = 0;
  const items = [...(batch.items ?? [])].sort(
    (a, b) =>
      Date.parse(a.snippet?.publishedAt ?? '') -
      Date.parse(b.snippet?.publishedAt ?? ''),
  );
  for (const item of items) {
    const snippet = item.snippet,
      time = Date.parse(snippet?.publishedAt ?? ''),
      viewerId = item.authorDetails?.channelId;
    if (!item.id || !viewerId || !Number.isFinite(time) || time < streamSince)
      continue;
    const name = (item.authorDetails?.displayName ?? 'Viewer').slice(0, 60);
    if (snippet?.type === 15 && snippet.superChatDetails) {
      const paid = snippet.superChatDetails;
      analytics.donation(stream, {
        id: item.id,
        viewerId,
        name,
        time,
        amountMicros: String(paid.amountMicros ?? ''),
        currency: paid.currency ?? '',
        comment: (paid.userComment ?? '').slice(0, 2000),
      });
    }
    if (
      snippet?.type !== 1 ||
      time < voteSince ||
      analytics.hasVote(stream, item.id)
    )
      continue;
    const result = acceptVote(
      next,
      {
        id: item.id,
        viewerId,
        viewer: name,
        time,
        text: snippet.textMessageDetails?.messageText ?? '',
      },
      now,
      seen,
      true,
    );
    if (result.accepted) {
      seen.add(item.id);
      accepted++;
      analytics.vote(stream, next.recent[0]);
    }
  }
  return { state: accepted ? next : state, accepted };
}
