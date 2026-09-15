'use client';
import {useEffect} from 'react';

const KEY='dro-floating-position-v1';

export default function DROBehavior(){
  useEffect(()=>{
    const root=document.querySelector<HTMLElement>('.droSite');
    const orb=root?.querySelector<HTMLElement>('.droOrb');
    if(!root||!orb)return;
    let dragging=false,startX=0,startY=0,startLeft=0,startTop=0;
    const saved=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}})();
    if(saved&&Number.isFinite(saved.left)&&Number.isFinite(saved.top)){
      root.style.left=`${Math.max(8,Math.min(window.innerWidth-root.offsetWidth-8,saved.left))}px`;
      root.style.top=`${Math.max(8,Math.min(window.innerHeight-root.offsetHeight-8,saved.top))}px`;
      root.style.right='auto';root.style.bottom='auto';
    }
    const move=(e:PointerEvent)=>{
      if(!dragging)return;
      const left=Math.max(8,Math.min(window.innerWidth-root.offsetWidth-8,startLeft+e.clientX-startX));
      const top=Math.max(8,Math.min(window.innerHeight-root.offsetHeight-8,startTop+e.clientY-startY));
      root.style.left=`${left}px`;root.style.top=`${top}px`;root.style.right='auto';root.style.bottom='auto';
    };
    const end=()=>{
      if(!dragging)return;
      dragging=false;orb.releasePointerCapture?.(0);
      const left=parseFloat(root.style.left),top=parseFloat(root.style.top);
      const dockLeft=left<window.innerWidth/2;
      const dockTop=top<window.innerHeight/2;
      const snapLeft=dockLeft?8:Math.max(8,window.innerWidth-root.offsetWidth-8);
      const snapTop=dockTop?top:Math.min(top,window.innerHeight-root.offsetHeight-8);
      root.style.left=`${snapLeft}px`;root.style.top=`${Math.max(8,snapTop)}px`;
      try{localStorage.setItem(KEY,JSON.stringify({left:snapLeft,top:Math.max(8,snapTop)}))}catch{}
    };
    const down=(e:PointerEvent)=>{
      if(e.button!==0)return;
      const target=e.target as HTMLElement;
      if(target.closest('.droPanel'))return;
      dragging=true;startX=e.clientX;startY=e.clientY;
      const r=root.getBoundingClientRect();startLeft=r.left;startTop=r.top;
      orb.setPointerCapture?.(e.pointerId);e.preventDefault();
    };
    orb.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
    const resize=()=>{if(root.style.left){const r=root.getBoundingClientRect();root.style.left=`${Math.max(8,Math.min(window.innerWidth-r.width-8,r.left))}px`;root.style.top=`${Math.max(8,Math.min(window.innerHeight-r.height-8,r.top))}px`}};
    window.addEventListener('resize',resize);
    return()=>{orb.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('resize',resize)};
  },[]);
  return null;
}
