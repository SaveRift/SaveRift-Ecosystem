// SPDX-License-Identifier: Apache-2.0
import {useState} from 'react';
import {Backpack,CaretDown,Coin,Fish,Package,PencilSimple,Sparkle} from '@phosphor-icons/react';

export function QuickChanges({copper,currentSize,onCopper,onSize,onResource,onKitchen,disabled=false,copperEditable=false}){
  const [open,setOpen]=useState(()=>typeof matchMedia!=='function'||!matchMedia('(max-width:620px)').matches);
  return <details className="explorer-quick-changes" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><Sparkle size={19} weight="duotone"/><strong>Quick changes</strong><span>Everyday essentials</span><CaretDown size={17}/></summary>
    <div className="quick-change-cards">
      <article><Coin size={24}/><div><h3>Copper</h3><p>{copper??'Unavailable'} in your purse</p></div><button className="button secondary" disabled={disabled||!copperEditable} onClick={onCopper}><PencilSimple size={14}/>Edit</button></article>
      <article><Backpack size={24}/><div><h3>A little more room</h3><p>Bag size {currentSize??'unavailable'}{currentSize!==null&&currentSize<250?` → ${Math.min(250,currentSize+10)}`:''}</p></div><button className="button secondary" disabled={disabled||currentSize===null||currentSize>=250} onClick={onSize}>{currentSize>=250?'At current limit':`+${Math.min(10,250-(currentSize??250))} slots`}</button></article>
      <article><Package size={24}/><div><h3>Resource shipment</h3><p>Supplies for your next journey.</p></div><button className="button secondary" disabled={disabled} onClick={onResource}>View pack</button></article>
      <article><Fish size={24}/><div><h3>Traveler’s pantry</h3><p>A few essentials for the road.</p></div><button className="button secondary" disabled={disabled} onClick={onKitchen}>View pack</button></article>
    </div>
  </details>;
}
