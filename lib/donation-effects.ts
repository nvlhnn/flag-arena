export type DonationEffects = { voice: boolean; names: boolean; amounts: boolean; animation: boolean; landmarks: boolean; duration: number; volume: number };
export const defaultDonationEffects: DonationEffects = { voice: true, names: true, amounts: true, animation: true, landmarks: true, duration: 10, volume: .85 };
export type DonationCelebration = { id: string; name: string; country: string; points: number; amountMicros: string; currency: string; startsAt: number; endsAt: number; preview?: boolean };
export function validDonationEffects(value: unknown): value is DonationEffects {
  if (!value || typeof value !== 'object') return false;
  const v = value as DonationEffects;
  return ['voice', 'names', 'amounts', 'animation', 'landmarks'].every(key => typeof v[key as keyof DonationEffects] === 'boolean')
    && Number.isInteger(v.duration) && v.duration >= 6 && v.duration <= 15 && Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1;
}
export function queueDonation(events: DonationCelebration[], event: Omit<DonationCelebration, 'startsAt' | 'endsAt'>, duration: number, now = Date.now()) {
  const pending = events.filter(item => item.endsAt > now);
  if (pending.some(item => item.id === event.id) || pending.length >= 30) return pending;
  const startsAt = Math.max(now + 500, (pending.at(-1)?.endsAt ?? 0) + 350);
  return [...pending, { ...event, startsAt, endsAt: startsAt + duration * 1000 }];
}
export function activeDonation(events: DonationCelebration[] | undefined, phase: string | undefined, now = Date.now()) {
  if (phase === 'countdown' || phase === 'results') return undefined;
  return events?.find(event => event.startsAt <= now && event.endsAt > now);
}
export function spokenName(name: string) {
  return name.normalize('NFKC').replace(/[@_-]+/g, ' ').replace(/[^\p{L}\p{N} '.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
