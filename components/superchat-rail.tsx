/* eslint-disable next/no-img-element -- Vite and OBS load YouTube avatars without a Next.js image server. */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Crown, UserRound, Sparkles } from 'lucide-react';
import { countries } from '../lib/arena';
import { donationAmount, type SupporterPage, type SupporterCard } from '../lib/superchat';
import { formatPoints } from '../lib/format-points';
import './superchat.css';

// Fetch ahead of the visible cards; motion never waits on a network request.
function useSuperChatConveyor(enabled: boolean, session: string) {
  const [page, setPage] = useState<SupporterPage>();
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled || !session) return;
    const controller = new AbortController(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout>, frame = 0;
    let current: SupporterPage | undefined, head = 0, phase = 0, last = 0;
    async function poll() {
      const requestedHead = head;
      try {
        const response = await fetch(`/api/supporters?offset=${requestedHead}&size=12`, { signal: controller.signal });
        if (!response.ok) throw new Error('Super Chats unavailable');
        const next: SupporterPage = await response.json();
        if (controller.signal.aborted || next.session !== session || head !== requestedHead) return;
        current = next; head = next.offset;
        setPage(next);
      } catch { /* Keep cached supporters moving until the local server recovers. */ }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2500); }
    }
    function animate(now: number) {
      const elapsed = last ? Math.min(now - last, 100) : 0; last = now;
      if (current && current.total > 3 && current.cards.length > 3) {
        phase += elapsed / 9000;
        if (phase >= 1) {
          phase -= 1;
          head = (head + 1) % current.total;
          current = { ...current, offset: head, cards: [...current.cards.slice(1), current.cards[0]] };
          // Recycle and reposition within one frame: no pause or visible loop reset.
          flushSync(() => setPage(current));
        }
        if (track.current) track.current.style.transform = reduced.matches ? 'none' : `translate3d(calc(${-(phase * 100 / 3)}% - ${phase * 1.2 / 3}cqw),0,0)`;
      } else {
        phase = 0;
        if (track.current) track.current.style.transform = 'none';
      }
      frame = requestAnimationFrame(animate);
    }
    void poll(); frame = requestAnimationFrame(animate);
    return () => { controller.abort(); clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [enabled, session]);
  return { page: enabled && page?.session === session ? page : undefined, track };
}

function DonationCard({ card }: { card: SupporterCard }) {
  const [failed, setFailed] = useState('');
  const country = countries.find(item => item.code === card.country)?.name;
  const amount=card.usdMicros===null?'Converting…':donationAmount(card.usdMicros,'USD');
  const points=`+${formatPoints(card.points)}`;
  const medal=card.rank&&card.rank<=3?` superchat-rank-${card.rank}`:'';
  return <article className={`superchat-card${medal}`} aria-label={`${card.rank?'Rank '+card.rank+', ':''}${card.name}, ${amount} session total, ${card.donationCount} donations${card.pendingCount?', conversion pending':''}`}>
    <span className="superchat-rank">{card.rank?'#'+card.rank:'FX'}</span>
    <div className="superchat-portrait">
      {card.avatar && failed!==card.avatar ? <img src={card.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(card.avatar)}/> : <div className="superchat-avatar-fallback"><UserRound/></div>}
      {card.rank===1&&<span className="superchat-crown" aria-hidden="true"><Crown/></span>}
      {card.country && <span className={`fi fi-${card.country.toLowerCase()}`} title={country} aria-label={country}/>}
    </div>
    <div className="superchat-card-copy">
      <b className="superchat-donor" title={card.name}>{card.name.startsWith('@') ? card.name : '@' + card.name}</b>
      <strong className="superchat-amount" title={`${amount} USD session total${card.pendingCount?' + pending conversion':''}`}>{amount}{card.pendingCount>0&&card.usdMicros!==null?'+':''}</strong>
      <span className="superchat-points" title={`${card.points.toLocaleString()} points awarded this session`}>{points}<small> PTS</small></span>
      <small className="superchat-donation-count">{card.pendingCount?`${card.pendingCount} converting`:`${card.donationCount} donation${card.donationCount===1?'':'s'}`}</small>
    </div>
  </article>;
}
export function SuperChatRail({ enabled, session }: { enabled: boolean; session: string }) {
  const { page, track } = useSuperChatConveyor(enabled, session);
  const cards = page?.cards ?? [], total = page?.total ?? 0;
  // Four donors need a repeated fifth card as an off-screen overscan slot.
  const visible = total > 3 ? [...cards, ...cards].slice(0, 5) : cards.slice(0, 3);
  return <section className="superchat-rail" aria-label="Super Chat supporters">
    <div className="superchat-rail-heading"><span><Crown/> THE SUPPORTER WALL</span><small>{total ? `${total} DONOR${total === 1 ? '' : 'S'} · USD` : 'YOUR COUNTRY. YOUR IMPACT.'}</small></div>
    {cards.length ? <div className="superchat-window"><div ref={track} className="superchat-track">{visible.map((card, index) => <DonationCard key={card.id + (index >= cards.length ? ':repeat' : '')} card={card}/>)}</div></div>
      : <div className="superchat-empty"><span className="superchat-empty-icon"><Sparkles/></span><div><b>A little support. A big move.</b><span>Session totals · highest donors first.</span></div></div>}
    <div className="superchat-glints" aria-hidden="true"><i/><i/><i/></div>
  </section>;
}
