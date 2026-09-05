'use client';
import {useEffect,useRef,type ReactNode} from 'react';

export function AnimatedFlag({voteId,children}:{voteId?:string;children:ReactNode}){
 const element=useRef<HTMLDivElement>(null);
 const animation=useRef<Animation|null>(null);
 useEffect(()=>{
  const node=element.current;
  if(!node||!voteId||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  // Keep flag geometry fixed; repeated votes continue from the current glow.
  const current=getComputedStyle(node);
  const filter=current.filter;
  animation.current?.cancel();
  animation.current=node.animate([
   {filter,offset:0},
   {filter:'brightness(1.3) drop-shadow(0 0 12px #ffd34c)',offset:.18},
   {filter:'brightness(1.1) drop-shadow(0 0 6px #ffd34c)',offset:.48},
   {filter:'brightness(1) drop-shadow(0 0 0px transparent)',offset:1},
  ],{duration:1600,easing:'cubic-bezier(.22,.61,.36,1)',fill:'none'});
 },[voteId]);
 useEffect(()=>()=>animation.current?.cancel(),[]);
 return <div ref={element} className="flag-face">{children}</div>;
}
