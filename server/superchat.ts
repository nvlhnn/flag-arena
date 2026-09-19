import {queueDonation,defaultDonationEffects,type DonationEffects} from '../lib/donation-effects.ts';
import type { ArenaDatabase } from './database.ts';
import type { ArenaState } from '../lib/arena.ts';
import { parseDonationCountry } from '../lib/arena.ts';
import { safeAvatar, superChatPoints, type SuperChatPage, type SupporterPage } from '../lib/superchat.ts';

export function createSuperChats(db: ArenaDatabase, getEffects:()=>DonationEffects=()=>defaultDonationEffects) {
  // Old purchases remain visible, but installing this feature never awards old money again.
  db.transaction(() => {
    if (db.get('superchatHistoryImported')) return;
    for (const row of db.sql('SELECT id FROM streams').all()) {
      const video = String(row.id);
      db.sql("INSERT OR IGNORE INTO superchat_awards(stream,id,session,round,avatar,country,status,points) SELECT stream,id,?,NULL,'',country,'historical',0 FROM donations WHERE stream=?").run(db.sessionFor(video), video);
    }
    db.set('superchatHistoryImported', true);
  });
  function capture(video: string, id: string, state: ArenaState, avatar: string | undefined, since: number, now: number) {
    const donation = db.sql('SELECT * FROM donations WHERE stream=? AND id=?').get(video, id)!;
    const round = state.match?.openedAt ?? 0;
    const open = state.mode === 'live' && state.match?.phase !== 'results' && now < (state.match?.endsAt ?? Infinity)
      && Number(donation.time) >= Math.max(since, round);
    const viewer = state.viewers?.[String(donation.viewer_id)];
    const country = parseDonationCountry(String(donation.comment)) ?? ((viewer?.lastVoteAt ?? -1) >= round ? viewer?.lastCountry : undefined) ?? null;
    let status = open ? 'pending' : 'closed';
    if (donation.currency === 'USD' && donation.usd_micros === null) {
      const amount = BigInt(String(donation.amount_micros));
      if (amount <= BigInt(Number.MAX_SAFE_INTEGER))
        db.sql("UPDATE donations SET usd_micros=?,rate='1',rate_date=date(time/1000,'unixepoch'),converted_at=? WHERE stream=? AND id=?").run(Number(amount), now, video, id);
      else status = 'unavailable';
    }
    db.sql('INSERT OR IGNORE INTO superchat_awards VALUES(?,?,?,?,?,?,?,0)').run(video, id, db.sessionFor(video), round, safeAvatar(avatar), country, status);
  }
  function apply(state: ArenaState, video: string, now = Date.now()): ArenaState {
    if (state.mode !== 'live' || !video) return state;
    const session = db.sessionFor(video), round = state.match?.openedAt ?? 0;
    if (state.match?.phase === 'results' || now >= (state.match?.endsAt ?? Infinity)) {
      db.sql("UPDATE superchat_awards SET status='closed' WHERE session=? AND status='pending'").run(session);
      return state;
    }
    db.sql("UPDATE superchat_awards SET status='closed' WHERE session=? AND status='pending' AND round<>?").run(session, round);
    const pending = db.sql("SELECT a.*,d.name,d.amount_micros,d.currency,d.viewer_id,d.usd_micros,d.country donation_country FROM superchat_awards a JOIN donations d ON d.stream=a.stream AND d.id=a.id WHERE a.session=? AND a.status='pending' ORDER BY d.time,a.stream,a.id").all(session);
    let next = state;
    for (const event of pending) {
      const viewer = state.viewers?.[String(event.viewer_id)];
      const country = event.country ?? ((viewer?.lastVoteAt ?? -1) >= round ? viewer?.lastCountry : undefined);
      if (!country) continue;
      if (event.country === null) db.sql('UPDATE superchat_awards SET country=? WHERE stream=? AND id=?').run(country, event.stream, event.id);
      if (event.usd_micros === null) continue;
      const points = superChatPoints(Number(event.usd_micros)), code = String(country);
      const total = (next.scores[code] ?? 0) + points;
      if (!Number.isSafeInteger(total)) {
        db.sql("UPDATE superchat_awards SET status='unavailable' WHERE stream=? AND id=?").run(event.stream, event.id);
        continue;
      }
      db.sql("UPDATE superchat_awards SET status='awarded',points=? WHERE stream=? AND id=? AND status='pending'").run(points, event.stream, event.id);
      next = { ...next, scores: { ...next.scores, [code]: total }, donationEvents:queueDonation(next.donationEvents??[],{id:String(event.stream)+':'+String(event.id),name:String(event.name),country:code,points,amountMicros:String(event.amount_micros),currency:String(event.currency)},getEffects().duration,now) };
    }
    return next;
  }
  function page(video: string, offset = 0, size = 4): SuperChatPage {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid donation position');
    if (!Number.isSafeInteger(size) || size < 1 || size > 60) throw new Error('Invalid donation page size');
    const session = video ? db.sessionFor(video) : '';
    const total = Number(db.sql('SELECT COUNT(*) count FROM superchat_awards WHERE session=?').get(session)!.count);
    const start = total ? offset % total : 0, limit = Math.min(total, size);
    const query = 'SELECT a.*,d.name,d.amount_micros,d.currency FROM superchat_awards a JOIN donations d ON d.stream=a.stream AND d.id=a.id WHERE a.session=? ORDER BY d.time,a.stream,a.id LIMIT ? OFFSET ?';
    const rows = db.sql(query).all(session, limit, start);
    if (rows.length < limit) rows.push(...db.sql(query).all(session, limit - rows.length, 0));
    return { session, total, offset: start, cards: rows.map(row => ({ id: String(row.stream) + ':' + String(row.id), name: String(row.name),
      avatar: String(row.avatar), country: row.country ? String(row.country) : null, amountMicros: String(row.amount_micros), currency: String(row.currency),
      points: Number(row.points), status: row.status as SuperChatPage['cards'][number]['status'] })) };
  }
  function supporters(video:string,offset=0,size=12):SupporterPage{
    if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid supporter position');
    if(!Number.isSafeInteger(size)||size<1||size>60)throw new Error('Invalid supporter page size');
    const session=video?db.sessionFor(video):'';
    const total=Number(db.sql('SELECT COUNT(DISTINCT d.viewer_id) count FROM superchat_awards a JOIN donations d ON d.stream=a.stream AND d.id=a.id WHERE a.session=?').get(session)!.count);
    const start=total?offset%total:0,limit=Math.min(size,total);
    // Rank people, across every broadcast/round in this session. Pending FX stays explicit.
    const query=`WITH entries AS (
      SELECT d.*,a.avatar,a.country award_country,a.points,
        ROW_NUMBER() OVER(PARTITION BY d.viewer_id ORDER BY d.time DESC,d.stream,d.id) latest,
        FIRST_VALUE(a.avatar) OVER(PARTITION BY d.viewer_id ORDER BY (a.avatar=''),d.time DESC,d.stream,d.id) latest_avatar
      FROM superchat_awards a JOIN donations d ON d.stream=a.stream AND d.id=a.id WHERE a.session=?
    ), donors AS (
      SELECT viewer_id,MAX(CASE WHEN latest=1 THEN name END) name,MAX(latest_avatar) avatar,
        CASE WHEN COUNT(DISTINCT award_country)=1 THEN MAX(award_country) END country,
        SUM(usd_micros) usd_total,SUM(points) points,COUNT(*) donations,
        SUM(usd_micros IS NULL) pending,MIN(time) first_at
      FROM entries GROUP BY viewer_id
    ), ranked AS (
      SELECT *,CASE WHEN usd_total IS NOT NULL THEN ROW_NUMBER() OVER(ORDER BY usd_total DESC,first_at,viewer_id) END rank
      FROM donors
    ) SELECT *,CAST(usd_total AS TEXT) usd_text FROM ranked ORDER BY usd_total DESC,first_at,viewer_id LIMIT ? OFFSET ?`;
    const rows=db.sql(query).all(session,limit,start);
    if(rows.length<limit)rows.push(...db.sql(query).all(session,limit-rows.length,0));
    const amountsFor=(viewerId:string)=>{
      const totals=new Map<string,bigint>();
      for(const entry of db.sql('SELECT d.currency,d.amount_micros FROM superchat_awards a JOIN donations d ON d.stream=a.stream AND d.id=a.id WHERE a.session=? AND d.viewer_id=?').all(session,viewerId)){
        const currency=String(entry.currency);totals.set(currency,(totals.get(currency)??BigInt(0))+BigInt(String(entry.amount_micros)));
      }
      return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([currency,amount])=>({currency,amountMicros:String(amount)}));
    };
    const countriesFor=(viewerId:string)=>db.sql('SELECT a.country FROM superchat_awards a JOIN donations d ON d.stream=a.stream AND d.id=a.id WHERE a.session=? AND d.viewer_id=? AND a.country IS NOT NULL ORDER BY d.time,a.stream,a.id LIMIT 1').all(session,viewerId).map(row=>String(row.country));
    return {session,total,offset:start,cards:rows.map(row=>({id:String(row.viewer_id),name:String(row.name),avatar:String(row.avatar),country:row.country?String(row.country):null,
      rank:row.rank===null?null:Number(row.rank),usdMicros:row.usd_text===null?null:String(row.usd_text),amounts:amountsFor(String(row.viewer_id)),countries:countriesFor(String(row.viewer_id)),points:Number(row.points),donationCount:Number(row.donations),pendingCount:Number(row.pending)}))};
  }
  return { capture, apply, page, supporters };
}
