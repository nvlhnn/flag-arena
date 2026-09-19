import type {ReactNode} from 'react';
import {Flag,Radio,PanelsTopLeft,BellRing,History,Settings2} from 'lucide-react';
import './studio-shell.css';

export const studioSections=[
 {id:'live',label:'Live',description:'Connect your stream and manage the current round.',icon:Radio},
 {id:'overlay',label:'Overlay',description:'Choose what viewers see and connect it to OBS.',icon:PanelsTopLeft},
 {id:'alerts',label:'Alerts & audio',description:'Configure celebrations, subscriber alerts, and stream sound.',icon:BellRing},
 {id:'history',label:'History',description:'Review recorded streams, donations, and voter activity.',icon:History},
 {id:'settings',label:'Settings',description:'Manage YouTube access, scoring rules, and maintenance.',icon:Settings2},
] as const;
export function StudioShell({section,navigate,mode,connected,session,demoRunning,children,preview,notice}:{section:string;navigate:(section:string)=>void;mode:'demo'|'live';connected?:boolean;session:string;demoRunning?:boolean;children:ReactNode;preview?:ReactNode;notice?:ReactNode}){
 const current=studioSections.find(item=>item.id===section)??studioSections[0];
 return <main className="studio studio-v2">
  <a className="studio-skip" href="#studio-content">Skip to controls</a>
  <header className="studio-topbar"><button className="studio-logo" type="button" onClick={()=>navigate('live')}><Flag size={21}/>Flag Arena<span>STUDIO</span></button><div className="studio-session-status"><span className={`studio-mode ${mode} ${connected?'connected':'disconnected'}`}>{mode==='demo'?(demoRunning?'Demo · running':'Demo mode'):connected?'Live · connected':'Live · disconnected'}</span><span className="studio-session-name">{mode==='demo'?'Test workspace':session?`Session · ${session}`:'Saved live session'}</span></div></header>
  <div className="studio-frame"><aside className="studio-sidebar"><span className="studio-nav-label">WORKSPACE</span><nav aria-label="Studio sections">{studioSections.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={section===id?'page':undefined} aria-controls="studio-content" onClick={()=>navigate(id)}><Icon size={18}/>{label}</button>)}</nav><div className="studio-sidebar-note">{mode==='demo'?'Demo activity stays separate from your live scores.':'Session progress is saved locally.'}</div></aside>
   <section className="studio-page" id="studio-content" tabIndex={-1} aria-label={current.label}><header className="studio-page-heading"><span>STUDIO / {current.label.toUpperCase()}</span><h1>{current.label}</h1><p>{current.description}</p></header><div className={`studio-page-layout ${preview?'has-preview':''}`}><div className="studio-page-controls">{children}</div>{preview&&<aside className="studio-preview-column">{preview}</aside>}</div></section>
  </div>{notice}
 </main>;
}

export function StudioSubnav({label,value,options,change}:{label:string;value:string;options:readonly (readonly [string,string])[];change:(value:string)=>void}){
 return <nav className="studio-subnav" aria-label={label}>{options.map(([id,title])=><button key={id} type="button" aria-pressed={value===id} onClick={()=>change(id)}>{title}</button>)}</nav>;
}
