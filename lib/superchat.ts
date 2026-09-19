export type SuperChatCard = {
  id: string; name: string; avatar: string; country: string | null;
  amountMicros: string; currency: string; points: number;
  status: 'pending' | 'awarded' | 'closed' | 'historical' | 'unavailable';
};
export type SuperChatPage = { session: string; total: number; offset: number; cards: SuperChatCard[] };
export type SupporterCard = {
  id:string;name:string;avatar:string;country:string|null;rank:number|null;
  usdMicros:string|null;points:number;donationCount:number;pendingCount:number;
  amounts:{currency:string;amountMicros:string}[];
  countries?:string[];
};
export type SupporterPage={session:string;total:number;offset:number;cards:SupporterCard[]};
export type OverlayLayout = 'current' | 'superchat';

export function superChatPoints(usdMicros: number): number {
  if (!Number.isSafeInteger(usdMicros) || usdMicros < 0) throw new Error('Invalid USD amount');
  // $1 = 1,000 points. Round down only fractional points, never round dollars.
  return Math.floor(usdMicros / 1000);
}
export function safeAvatar(value: string | undefined): string {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && (url.hostname === 'yt3.ggpht.com' || url.hostname.endsWith('.googleusercontent.com')) ? url.href : '';
  } catch { return ''; }
}
export function donationAmount(amount: string, currency: string): string {
  const micros = BigInt(amount), whole = micros / BigInt(1000000);
  const fraction = String(micros % BigInt(1000000)).padStart(6, '0').replace(/0+$/, '');
  const value = whole.toLocaleString('en-US') + (fraction ? '.' + fraction : '');
  return currency === 'USD' ? '$' + value : currency + ' ' + value;
}
