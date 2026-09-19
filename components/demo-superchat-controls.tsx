import {useState} from 'react';
import type {DemoSuperChat} from '../lib/demo-superchat';
import {donationAmount} from '../lib/superchat';

export function DemoSuperChatControls({viewer,enabled,cards,send}:{viewer:string;enabled:boolean;cards:DemoSuperChat[];send:(body:Record<string,unknown>)=>Promise<unknown>}){
 const [amount,setAmount]=useState('5'),[currency,setCurrency]=useState('USD'),[message,setMessage]=useState('Go Indonesia!'),[usdAmount,setUsdAmount]=useState('5'),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 return <div className="control-card"><div className="card-title"><h2>Test Super Chat</h2><span className="tag">DEMO</span></div>
  <p>Send as <b>{viewer||'the test viewer above'}</b>. Adds demo points and a supporter card. Use the same viewer for chat votes before or after donating.</p>
  <form onSubmit={async event=>{event.preventDefault();setBusy(true);setNotice('');try{await send({viewer,amount,currency,message,usdAmount});setNotice('Test Super Chat sent. Check its status below and the arena preview.');}catch(error){setNotice((error as Error).message);}finally{setBusy(false);}}}>
   <label htmlFor="demo-paid-amount">Donation amount</label><input id="demo-paid-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} required/>
   <label htmlFor="demo-paid-currency">Original currency</label><input id="demo-paid-currency" value={currency} maxLength={3} pattern="[A-Z]{3}" onChange={e=>setCurrency(e.target.value.toUpperCase())} required/>
   {currency!=='USD'&&<><label htmlFor="demo-paid-usd">Simulated USD equivalent</label><input id="demo-paid-usd" inputMode="decimal" value={usdAmount} onChange={e=>setUsdAmount(e.target.value)} required/><small>Choose the equivalent for this test. $1 USD = 1,000 points; the card still shows the original currency. This is not a live exchange rate.</small></>}
   <label htmlFor="demo-paid-message">Super Chat message (optional)</label><input id="demo-paid-message" maxLength={2000} value={message} placeholder="Leave blank to test a donation without chat" onChange={e=>setMessage(e.target.value)}/>
   <small>Try “Go Indonesia!”, a flag, or an empty message. Without a country or a previous vote this round, points wait for this viewer’s next country chat.</small>
   <button className="primary" disabled={!enabled||busy}>{busy?'Sending…':'Send test Super Chat'}</button>
  </form>
  {!enabled&&<small>Switch to demo mode to test.</small>}
  {notice&&<output role="status">{notice}</output>}
  {cards.length>0&&<div aria-label="Test Super Chat results">{cards.slice(-5).reverse().map(card=><p key={card.id}><b>{card.name}</b> · {donationAmount(card.amountMicros,card.currency)}<br/>{card.status==='awarded'?`${card.country} +${card.points.toLocaleString()} points`:card.status==='closed'?'Round closed — no points awarded':'Waiting for this viewer’s country chat'}</p>)}</div>}
 </div>;
}
