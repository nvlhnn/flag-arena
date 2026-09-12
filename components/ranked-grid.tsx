'use client';
import {useLayoutEffect,useRef,type ReactNode} from 'react';

export function RankedGrid({children}:{children:ReactNode}){
 const grid=useRef<HTMLDivElement>(null);
 const positions=useRef(new Map<string,{x:number;y:number}>());
 const animations=useRef(new Map<string,Animation>());
 useLayoutEffect(()=>{
  const nodes=Array.from(grid.current?.children??[]) as HTMLElement[];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const next=new Map<string,{x:number;y:number}>();
  // Read every position before writes; interrupted moves resume from their visible position.
  const moves=nodes.map(node=>{
   const key=node.dataset.country!;
   const position={x:node.offsetLeft,y:node.offsetTop};
   next.set(key,position);
   const old=positions.current.get(key);
   const transform=getComputedStyle(node).transform;
   const matrix=transform==='none'?null:new DOMMatrixReadOnly(transform);
   return {node,key,moved:!!old&&(old.x!==position.x||old.y!==position.y),dx:old?old.x-position.x+(matrix?.m41??0):0,dy:old?old.y-position.y+(matrix?.m42??0):0};
  });
  for(const {node,key,moved,dx,dy} of moves){
   if(!moved&&!reduced)continue;
   animations.current.get(key)?.cancel();
   animations.current.delete(key);
   if(!reduced&&(Math.abs(dx)>.5||Math.abs(dy)>.5)){
    animations.current.set(key,node.animate([
     {transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'},
    ],{duration:650,easing:'cubic-bezier(.22,.61,.36,1)'}));
   }
  }
  for(const [key,animation] of animations.current)if(!next.has(key)){animation.cancel();animations.current.delete(key);}
  positions.current=next;
 });
 useLayoutEffect(()=>()=>{for(const animation of animations.current.values())animation.cancel();},[]);
 return <div ref={grid} className="flag-grid">{children}</div>;
}
