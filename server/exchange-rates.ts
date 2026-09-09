import type { ArenaDatabase } from './database.ts';

// Decimal multiplication using integers; preserve micros and round only once.
export function convertMicros(amount: string, rate: string): number {
  if (!/^\d+(\.\d+)?$/.test(rate)) throw new Error('Invalid exchange rate');
  const [whole, fraction = ''] = rate.split('.'),
    scale = BigInt(10) ** BigInt(fraction.length);
  const result =
    (BigInt(amount) * BigInt(whole + fraction) + scale / BigInt(2)) / scale;
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Converted amount exceeds supported range');
  return Number(result);
}
export function createExchangeRates(
  store: ArenaDatabase,
  request: typeof fetch = fetch,
) {
  let busy = false;
  const retryAt = new Map<string, number>();
  async function refresh(now = Date.now()) {
    if (busy) return;
    busy = true;
    try {
      // One request per currency/day; no donor names, IDs or amounts leave the PC.
      const pending = store
        .sql(
          `SELECT DISTINCT currency,substr(strftime('%Y-%m-%d',time/1000,'unixepoch'),1,10) day FROM donations WHERE usd_micros IS NULL LIMIT 100`,
        )
        .all();
      for (const pair of pending) {
        const currency = String(pair.currency),
          day = String(pair.day),
          key = currency + day;
        if ((retryAt.get(key) ?? 0) > now) continue;
        try {
          let rate = store
            .sql(
              'SELECT * FROM exchange_rates WHERE currency=? AND requested_date=?',
            )
            .get(currency, day);
          if (!rate) {
            if (currency === 'USD') rate = { rate: '1', rate_date: day };
            else {
              const response = await request(
                `https://api.frankfurter.dev/v2/rate/${currency}/USD?date=${day}`,
                { signal: AbortSignal.timeout(10000) },
              );
              if (!response.ok) throw new Error('Exchange rate unavailable');
              const data = (await response.json()) as {
                rate?: number;
                date?: string;
                base?: string;
                quote?: string;
              };
              if (
                data.base !== currency ||
                data.quote !== 'USD' ||
                typeof data.rate !== 'number' ||
                !Number.isFinite(data.rate) ||
                data.rate <= 0 ||
                !/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? '') ||
                data.date! > day
              )
                throw new Error('Invalid exchange rate response');
              const decimal = data.rate.toLocaleString('en-US', {
                useGrouping: false,
                maximumFractionDigits: 20,
              });
              rate = { rate: decimal, rate_date: data.date! };
            }
            store
              .sql('INSERT OR IGNORE INTO exchange_rates VALUES(?,?,?,?,?)')
              .run(
                currency,
                day,
                String(rate.rate),
                String(rate.rate_date),
                now,
              );
          }
          store.transaction(() => {
            const rows = store
              .sql(
                "SELECT stream,id,amount_micros FROM donations WHERE currency=? AND date(time/1000,'unixepoch')=? AND usd_micros IS NULL",
              )
              .all(currency, day);
            for (const row of rows)
              store
                .sql(
                  'UPDATE donations SET usd_micros=?,rate=?,rate_date=?,converted_at=? WHERE stream=? AND id=? AND usd_micros IS NULL',
                )
                .run(
                  convertMicros(String(row.amount_micros), String(rate!.rate)),
                  String(rate!.rate),
                  String(rate!.rate_date),
                  now,
                  String(row.stream),
                  String(row.id),
                );
          });
          retryAt.delete(key);
        } catch {
          retryAt.set(key, now + 300000);
        }
      }
    } catch {
      // A failed background lookup must not stop chat ingestion; retry next cycle.
    } finally {
      busy = false;
    }
  }
  return { refresh };
}
