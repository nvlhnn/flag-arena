import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spokenName, type DonationCelebration, type DonationEffects } from '../lib/donation-effects.ts';

export function synthesize(text: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('../scripts/synthesize-donation.ps1', import.meta.url));
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], timeout: 15000 });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Local English speech unavailable')));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ text, output }));
  });
}
export function createDonationVoice(directory: string, generate = synthesize) {
  const folder = join(directory, 'donation-voice'); mkdirSync(folder, { recursive: true });
  const pending = new Map<string, Promise<string>>();
  let queue = Promise.resolve();
  const file = (key: string) => /^[a-f0-9]{64}$/.test(key) ? join(folder, key + '.wav') : undefined;
  function prune() {
    const files = readdirSync(folder).filter(name => /^[a-f0-9]{64}\.wav$/.test(name)).map(name => {const stat=statSync(join(folder,name));return {name,size:stat.size,mtimeMs:stat.mtimeMs};}).sort((a, b) => b.mtimeMs - a.mtimeMs);
    let bytes = 0;
    files.forEach((entry, index) => { bytes += entry.size; if (index >= 256 || bytes > 32 * 1024 * 1024) unlinkSync(join(folder, entry.name)); });
  }
  function clip(text: string): Promise<string> {
    const key = createHash('sha256').update('english-v1:' + text).digest('hex'), path = file(key)!;
    if (existsSync(path)) return Promise.resolve('/api/donation-voice/' + key + '.wav');
    if (pending.has(key)) return pending.get(key)!;
    if (pending.size >= 30) return Promise.reject(new Error('Speech queue busy'));
    const result = queue.then(async () => {
      const temp = path + '.tmp';
      try { await generate(text, temp); renameSync(temp, path); prune(); }
      finally { if (existsSync(temp)) unlinkSync(temp); }
      return '/api/donation-voice/' + key + '.wav';
    }).finally(() => pending.delete(key));
    pending.set(key, result); queue = result.then(() => {}, () => {}); return result;
  }
  async function playlist(event: DonationCelebration, settings: DonationEffects) {
    const name = settings.names ? spokenName(event.name) : '';
    const jobs: { kind: string; text: string }[] = [];
    if (name) jobs.push({ kind: 'name', text: name });
    if (settings.amounts) {
      const amount = Number(event.amountMicros) / 1e6;
      const currency = new Intl.DisplayNames(['en'], { type: 'currency' }).of(event.currency) ?? event.currency;
      jobs.push({ kind: 'amount', text: `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}.` });
    }
    jobs.push({ kind: 'points', text: `${event.points.toLocaleString('en-US')} points for` });
    const generated = await Promise.all(jobs.map(async job => ({ kind: job.kind, url: await clip(job.text).catch(() => '') })));
    const get = (kind: string) => generated.find(item => item.kind === kind)?.url;
    return { clips: ['/audio/en/donation-thank-you.wav', ...(get('name') ? [get('name')!] : []), '/audio/en/donation-super-chat.wav',
      ...(get('amount') ? [get('amount')!] : []), ...(get('points') ? [get('points')!, `/audio/en/${event.country}.wav`] : [])] };
  }
  return { playlist, file, clip };
}
