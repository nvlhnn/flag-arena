import {useEffect,useState,useMemo,type CSSProperties} from 'react';
import {Trophy} from 'lucide-react';
import type {Match} from '../lib/arena';

export function MatchOverlay({match}:{match?:Match}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(match?.phase!=='countdown')return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(timer);},[match?.phase,match?.endsAt]);
 const elapsed=useMemo(()=>Math.max(0,Date.now()-(match?.endsAt??Date.now())),[match?.phase,match?.endsAt]);
 if(!match||match.phase==='open')return null;
 const remaining=Math.max(0,Math.min(10,Math.ceil(((match.endsAt??now)-now)/1000)));
 if(match.phase==='countdown')return <div className="match-countdown" role="status"><span>FINAL SECONDS</span><div className="countdown-ring"><strong key={remaining}>{remaining}</strong></div><b>{remaining?'VOTE FOR YOUR COUNTRY':'VOTING CLOSED'}</b><small>Every vote adds 100 points</small></div>;
 const results=match.results||[];
 return <div className="match-results" aria-label="Final match results"><div className="result-sparkles" aria-hidden="true">{Array.from({length:18},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,animationDelay:`${i*.19}s`}}/>)}</div><div className="results-heading"><Trophy/><span>MATCH COMPLETE</span><h2>WORLD'S TOP {results.length||5}</h2></div><div className="result-list">{results.map((country,index)=><div key={country.code} className={`result-country ${index===0?'result-winner':''}`} style={{animationDelay:`${((results.length-1-index)*850-elapsed)/1000}s`} as CSSProperties}><span className="result-rank">{index===0?<Trophy/>:`0${index+1}`}</span><span role="img" aria-label={country.name} className={`fi fi-${country.code.toLowerCase()}`}/><div><small>{index===0?'CHAMPION':`PLACE ${index+1}`}</small><b>{country.name}</b><strong>{country.points.toLocaleString()} <em>POINTS</em></strong></div></div>)}</div>{!results.length&&<p className="no-results">No votes this match.<br/>The next match is yours.</p>}<p className="results-footer">{results.length?'THANK YOU FOR REPRESENTING YOUR COUNTRY':'READY FOR ANOTHER ROUND'}</p></div>;
}
