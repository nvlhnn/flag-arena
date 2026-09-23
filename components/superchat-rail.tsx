/* eslint-disable next/no-img-element -- Vite and OBS load YouTube avatars without a Next.js image server. */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Crown, UserRound, Sparkles } from 'lucide-react';
import { countries } from '../lib/arena';
import { donationAmount, type SupporterPage, type SupporterCard } from '../lib/superchat';
import './superchat.css';

// Fetch ahead of the visible cards; motion never waits on a network request.
function useSuperChatConveyor(enabled: boolean, session: string, preview?: SupporterPage, tactical=false) {
  const previewRef=useRef(preview);previewRef.current=preview;
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
        let next:SupporterPage;
        if(previewRef.current){const source=previewRef.current;const start=source.total?requestedHead%source.total:0;next={...source,offset:start,cards:[...source.cards.slice(start),...source.cards.slice(0,start)].slice(0,12)};}
        else {const response = await fetch(`/api/supporters?offset=${requestedHead}&size=12`, { signal: controller.signal });
        if (!response.ok) throw new Error('Super Chats unavailable');
        next = await response.json();}
        if (controller.signal.aborted || next.session !== session || head !== requestedHead) return;
        current = next; head = next.offset;
        setPage(next);
      } catch { /* Keep cached supporters moving until the local server recovers. */ }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2500); }
    }
    function animate(now: number) {
      const elapsed = last ? Math.min(now - last, 100) : 0; last = now;
      if (current && current.total > 2 && current.cards.length > 2) {
        const first=track.current?.firstElementChild as HTMLElement|undefined;
        const second=first?.nextElementSibling as HTMLElement|undefined;
        const stride=first&&second?second.offsetLeft-first.offsetLeft:0;
        const items=track.current?.children;
        const sample=items?Array.from(items).slice(0,Math.min(current.total,items.length)):[];
        const gap=track.current?parseFloat(getComputedStyle(track.current).columnGap)||0:0;
        const cycleWidth=sample.reduce((sum,item)=>sum+(item as HTMLElement).offsetWidth+gap,0)*current.total/Math.max(1,sample.length);
        const duration=tactical&&stride>0&&cycleWidth>0?45000*stride/cycleWidth:9000;
        phase += reduced.matches?0:elapsed/duration;
        if (phase >= 1) {
          phase -= 1;
          head = (head + 1) % current.total;
          current = { ...current, offset: head, cards: [...current.cards.slice(1), current.cards[0]] };
          // Recycle and reposition within one frame: no pause or visible loop reset.
          flushSync(() => setPage(current));
        }
        if (track.current) track.current.style.transform = reduced.matches ? 'none' : tactical?`translate3d(${-phase*stride}px,0,0)`:`translate3d(calc(${-(phase * 100 / 2)}% - ${phase * 1.2 / 2}cqw),0,0)`;
      } else {
        phase = 0;
        if (track.current) track.current.style.transform = 'none';
      }
      frame = requestAnimationFrame(animate);
    }
    void poll(); frame = requestAnimationFrame(animate);
    return () => { controller.abort(); clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [enabled, session, tactical]);
  return { page: enabled && page?.session === session ? page : undefined, track };
}

function tacticalAmount(amountMicros:string,currency:string){
  const value=Number(amountMicros)/1000000;
  if(currency==='IDR')return `IDR ${new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value)}`;
  const formatted=new Intl.NumberFormat('en-US',{style:'currency',currency}).format(value);
  return currency==='KRW'?formatted:`${formatted} ${currency}`;
}
const tacticalIcon=(code:string|null|undefined,rank:number|null|undefined)=>rank===1?'👑':({MX:'🐉',JP:'🌸',FR:'⚡',KR:'🇰🇷'} as Record<string,string>)[code??'']??'⚡';

function DonationCard({ card, tactical=false }: { card: SupporterCard; tactical?:boolean }) {
  const [failed, setFailed] = useState('');
  const [amountIndex,setAmountIndex]=useState(0);
  useEffect(()=>{
    if(card.amounts.length<2)return;
    const timer=setInterval(()=>setAmountIndex(index=>index+1),4000);
    return()=>clearInterval(timer);
  },[card.id,card.amounts.length]);
  const flagCodes=card.countries?.length?card.countries:(card.country?[card.country]:[]);
  const country = flagCodes.map(code=>countries.find(item => item.code === code)?.name).filter(Boolean).join(', ');
  const amount=card.amounts.map(entry=>donationAmount(entry.amountMicros,entry.currency)).join(' + ');
  const displayedAmount=card.amounts[amountIndex%card.amounts.length];
  const medal=card.rank&&card.rank<=3?` superchat-rank-${card.rank}`:'';
  return <article className={`superchat-card${medal}`} aria-label={`${card.rank?'Rank '+card.rank+', ':''}${card.name}, ${amount} session total, ${card.donationCount} donations${card.pendingCount?', conversion pending':''}`}>
    {card.rank===1&&<span className="superchat-border-crown" aria-hidden="true"><Crown/></span>}
    <div className="superchat-portrait">
      {card.avatar && failed!==card.avatar ? <img src={card.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(card.avatar)}/> : <div className="superchat-avatar-fallback">{tactical?<span className="tactical-avatar-symbol" aria-hidden="true">{tacticalIcon(card.country,card.rank)}</span>:<UserRound/>}</div>}
      {flagCodes.length>0&&<span className="superchat-country-group" role="img" title={country} aria-label={country}>{flagCodes.map(code=><span key={code} className={`fi fi-${code.toLowerCase()} superchat-country`}/>)}</span>}
    </div>
    <div className="superchat-card-copy">
    <div className={tactical?'tactical-donor-line':undefined}><b className="superchat-donor" title={card.name}>{card.name.startsWith('@') ? card.name : '@' + card.name}</b>{tactical&&card.rank!=null&&card.rank<=3&&<span className={`tactical-donor-badge ${card.rank===1?'is-mvp':''}`}>{card.rank===1?'🔥 #1 MVP':'ELITE'}</span>}</div>
    <strong className="superchat-amount" title={`${amount} session total`} aria-label={`${amount} session total`}>{displayedAmount?(tactical?tacticalAmount(displayedAmount.amountMicros,displayedAmount.currency):donationAmount(displayedAmount.amountMicros,displayedAmount.currency)):'—'}</strong>
    </div>
  </article>;
}
export function SuperChatRail({ enabled, session, preview, tactical=false }: { enabled: boolean; session: string; preview?:SupporterPage; tactical?:boolean }) {
  const { page, track } = useSuperChatConveyor(enabled||!!preview, session, preview, tactical);
  const cards = page?.cards ?? [], total = page?.total ?? 0;
  // Keep an extra card beyond the incoming third card for smooth recycling.
  const visible = total > 2 ? [...cards, ...cards].slice(0, tactical?8:4) : cards.slice(0, 2);
  return <section className="superchat-rail" aria-label="Super Chat supporters">
    <div className="superchat-rail-heading"><span><Crown/> THE SUPPORTER WALL</span><small className={tactical?'tactical-patron':undefined}>{tactical?<><i/> BECOME A PATRON</>:total ? `${total} DONOR${total === 1 ? '' : 'S'}` : 'YOUR COUNTRY. YOUR IMPACT.'}</small></div>
    {cards.length ? <div className="superchat-window"><div ref={track} className="superchat-track">{visible.map((card, index) => tactical?<div className="tactical-runway-item" key={card.id + (index >= cards.length ? ':repeat' : '')}><DonationCard card={card} tactical/>{card.rank===total&&<div className="tactical-patron-card"><span>⚡</span><div><b>CLAIM YOUR SPOT ON STREAM</b><small>SEND SUPER CHAT TO TAKE CROWN 👑</small></div></div>}</div>:<DonationCard key={card.id + (index >= cards.length ? ':repeat' : '')} card={card}/>)}</div></div>
      : <div className="superchat-empty"><span className="superchat-empty-icon"><Sparkles/></span><div><b>A little support. A big move.</b><span>Session totals · highest donors first.</span></div></div>}
    <div className="superchat-glints" aria-hidden="true"><i/><i/><i/></div>
  </section>;
}
