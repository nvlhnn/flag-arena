import { memo, useEffect, useState } from 'react';
import { Trophy, Heart, Globe2, ArrowLeft, ArrowRight } from 'lucide-react';
import { countries } from '../lib/arena';
import type { StreamAnalytics as Analytics } from '../lib/analytics';

const usd = (micros: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    micros / 1e6,
  );
const originalAmount = (micros: string) => {
  const padded = micros.padStart(7, '0'),
    whole = BigInt(padded.slice(0, -6)).toLocaleString('en-US'),
    fraction = padded.slice(-6).replace(/0+$/, '');
  return whole + (fraction ? '.' + fraction : '');
};
function Country({ code }: { code: string | null }) {
  return code ? (
    <span className="analytics-country">
      <span aria-hidden="true" className={`fi fi-${code.toLowerCase()}`} />
      {countries.find((c) => c.code === code)?.name ?? code}
    </span>
  ) : (
    <span className="analytics-pending">Unassigned</span>
  );
}
function Pages({
  page,
  more,
  change,
}: {
  page: number;
  more: boolean;
  change: (page: number) => void;
}) {
  return (
    <div className="analytics-pages">
      <button
        disabled={!page}
        onClick={() => change(page - 1)}
        aria-label="Previous page"
      >
        <ArrowLeft size={16} />
      </button>
      <span>Page {page + 1}</span>
      <button
        disabled={!more}
        onClick={() => change(page + 1)}
        aria-label="Next page"
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

export const StreamAnalytics = memo(function StreamAnalytics({
  local,
}: {
  local: boolean;
}) {
  const [streams, setStreams] = useState<NonNullable<Analytics['stream']>[]>(
      [],
    ),
    [stream, setStream] = useState('');
  const [data, setData] = useState<Analytics | null>(null),
    [error, setError] = useState('');
  const [donorPage, setDonorPage] = useState(0),
    [donationPage, setDonationPage] = useState(0);
  useEffect(() => {
    if (!local) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      try {
        const params = new URLSearchParams({
          donorPage: String(donorPage),
          donationPage: String(donationPage),
          ...(stream ? { stream } : {}),
        });
        const [list, response] = await Promise.all([
          fetch('/api/analytics/streams', { signal: controller.signal }),
          fetch(`/api/analytics?${params}`, { signal: controller.signal }),
        ]);
        if (!list.ok || !response.ok)
          throw new Error('Analytics could not be loaded. Retrying…');
        setStreams(await list.json());
        setData(await response.json());
        setError('');
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void update(), 3000);
      }
    };
    void update();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [local, stream, donorPage, donationPage]);
  if (!local)
    return (
      <section className="analytics-main">
        <h2>Stream analytics</h2>
        <p>
          Open the local app to record chat votes and Super Chats from your
          channel.
        </p>
      </section>
    );
  return (
    <section className="analytics-main" aria-label="Stream analytics">
      <header className="analytics-heading">
        <div>
          <span className="eyebrow">YOUR COMMUNITY, BY THE NUMBERS</span>
          <h2>Stream analytics</h2>
          <p>Whole-stream totals. Match resets never clear these records.</p>
        </div>
        <label>
          Livestream
          <select
            value={stream}
            onChange={(e) => {
              setStream(e.target.value);
              setDonorPage(0);
              setDonationPage(0);
              setData(null);
            }}
          >
            <option value="">Current / last connected stream</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {new Date(s.tracked_from).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && <output className="analytics-pending">{error}</output>}
      {!data ? (
        <p>Loading analytics…</p>
      ) : !data.stream ? (
        <div className="analytics-empty">
          <Trophy />
          <h3>Your stream starts the story</h3>
          <p>
            Connect live chat to begin recording votes and Super Chats. Demo
            votes stay separate.
          </p>
        </div>
      ) : (
        <>
          <p className="analytics-since">
            Recording since{' '}
            {new Date(data.stream.tracked_from).toLocaleString()}.
            {data.stream.partial
              ? ' Imported history is partial; only retained votes were available.'
              : ' Events from before tracking began are not included.'}
          </p>
          <div className="analytics-metrics">
            <div>
              <Heart />
              <span>Super Chat total</span>
              <strong key={data.totals.usd_micros}>
                {usd(data.totals.usd_micros)}
              </strong>
              <small>Gross purchases · estimated USD</small>
            </div>
            <div>
              <Globe2 />
              <span>Donations recorded</span>
              <strong key={data.totals.donations}>
                {data.totals.donations.toLocaleString()}
              </strong>
              <small>
                {data.totals.pending
                  ? `${data.totals.pending} awaiting USD conversion`
                  : 'All recorded amounts converted'}
              </small>
            </div>
          </div>
          <div className="analytics-columns">
            <section className="analytics-card">
              <h3>
                <Trophy size={18} />
                Top 5 chat voters
              </h3>
              <p>Chat points only · most-voted country · ties share rank</p>
              {data.voters.length ? (
                <ol className="analytics-voters">
                  {data.voters.map((v) => (
                    <li key={v.viewer_id}>
                      <span className="analytics-rank">{v.rank}</span>
                      <div>
                        <b>{v.name}</b>
                        <Country code={v.country} />
                      </div>
                      <strong>
                        {v.points.toLocaleString()}
                        <small>{v.votes.toLocaleString()} votes</small>
                      </strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="analytics-empty">
                  The first accepted country vote starts this ranking.
                </p>
              )}
            </section>
            <section className="analytics-card">
              <h3>
                <Globe2 size={18} />
                Country Super Chat ranking
              </h3>
              <p>
                Country locked at donation time, or after the donor’s first
                country vote.
              </p>
              {data.countries.length ? (
                <ol className="analytics-country-list">
                  {data.countries.map((c) => (
                    <li key={c.country ?? 'unassigned'}>
                      <Country code={c.country} />
                      <strong>
                        {usd(c.usd_micros)}
                        <small>
                          {c.donations} donations
                          {c.pending ? ` · ${c.pending} pending USD` : ''}
                        </small>
                      </strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="analytics-empty">
                  Country totals appear when Super Chats arrive.
                </p>
              )}
            </section>
          </div>
          <section className="analytics-card">
            <h3>
              <Heart size={18} />
              All Super Chat donors
            </h3>
            <div className="analytics-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Viewer</th>
                    <th>Donations</th>
                    <th>USD total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.donors.map((d) => (
                    <tr key={d.viewer_id}>
                      <td>{d.name}</td>
                      <td>{d.donations}</td>
                      <td>
                        {usd(d.usd_micros)}
                        {d.pending > 0 && (
                          <small>{d.pending} pending conversion</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.donors.length && <p>No Super Chats recorded yet.</p>}
            <Pages
              page={donorPage}
              more={data.hasMoreDonors}
              change={setDonorPage}
            />
          </section>
          <section className="analytics-card">
            <h3>Donation history</h3>
            <p>
              Original purchases are preserved. USD uses a saved daily reference
              rate, before platform fees.
            </p>
            <div className="analytics-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Viewer / time</th>
                    <th>Country</th>
                    <th>Original</th>
                    <th>USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.donations.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <b>{d.name}</b>
                        <small>{new Date(d.time).toLocaleString()}</small>
                        {d.comment && (
                          <small className="donation-comment">
                            {d.comment}
                          </small>
                        )}
                      </td>
                      <td>
                        <Country code={d.country} />
                      </td>
                      <td>
                        {d.currency} {originalAmount(d.amount_micros)}
                      </td>
                      <td>
                        {d.usd_micros === null ? (
                          <span className="analytics-pending">Pending</span>
                        ) : (
                          <>
                            {usd(d.usd_micros)}
                            <small title={`1 ${d.currency} = ${d.rate} USD`}>
                              {d.rate_date}
                            </small>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.donations.length && (
              <p>Every recorded Super Chat will appear here.</p>
            )}
            <Pages
              page={donationPage}
              more={data.hasMoreDonations}
              change={setDonationPage}
            />
          </section>
        </>
      )}
    </section>
  );
});
