import {PluginImage} from './PluginImage.jsx';
// SPDX-License-Identifier: Apache-2.0
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Backpack,CaretRight,CheckCircle,CheckSquare,Coin,LockSimple,MagnifyingGlass,Package,ShieldCheck,SpinnerGap,Sword,X} from '@phosphor-icons/react';
import {useCrimsonServices} from './bridge.jsx';
import {assertCompiledPack,packContextKey,packEntryStatus,packOwnershipLabel} from './pack-ui-plan.mjs';
import {collectionBackdrop,packItemArtwork,packArtwork} from './pack-artwork.mjs';
import './pack-browser.css';
import './pack-capacity.css';

const EMPTY=[];
const categories=[['all','All packs'],['resources','Resources'],['supplies','Supplies'],['currency','Copper'],['storage','Storage'],['gear','Gear collections']];
const numbers=value=>value===null||value===undefined?'—':/^\d+$/.test(String(value))?BigInt(value).toLocaleString():String(value);
const packSymbol=category=>category==='currency'?Coin:category==='storage'?Backpack:category==='gear'?Sword:Package;
function PackArt({pack,large=false}){
  const Symbol=packSymbol(pack.category),cover=packArtwork(pack),art=cover?[cover]:[...new Set(pack.contents?.map(c=>packItemArtwork(pack,c)).filter(Boolean)||[])].slice(0,4);
  return <span className={`pack-art ${large?'large':''} ${art.length?'has-art':''}`} aria-hidden="true">{art.length?art.map(url=><PluginImage key={url} src={url} alt="" loading="lazy" onError={event=>{event.currentTarget.hidden=true;}}/>):<Symbol size={large?52:35} weight="duotone"/>}</span>;
}
function CollectionBackdrop({pack}){
  const url=collectionBackdrop(pack),[failedUrl,setFailedUrl]=useState(null);
  return url&&failedUrl!==url?<span className="pack-collection-backdrop" aria-hidden="true"><PluginImage src={url} alt="" loading="lazy" onError={()=>setFailedUrl(url)}/></span>:null;
}
function previewLabel(preview){
  if(!preview)return 'View contents';
  if(preview.mergeConflict)return 'Review current changes';
  const summary=preview.summary||{};
  if(!summary.changes&&!summary.unavailable&&!summary.conflicts)return preview.entries?.some(e=>String(e.current)!==String(e.effective))?'Already in your changes':'Already covered';
  if(preview.canStageFull)return `${summary.changes} ${summary.changes===1?'change':'changes'} ready`;
  if(preview.canStageAvailable)return `${summary.changes} ${summary.changes===1?'change':'changes'} available`;
  return 'Collection preview';
}
export function PackDetail({recipe,localPreview,catalog,backup,report,payload,drafts,onClose,onStage,disabled,advanced}){
  const services=useCrimsonServices();
  const dialog=useRef(null),context=packContextKey(backup,report,payload,drafts),contextRef=useRef(context),generation=useRef(0);
  contextRef.current=context;
  const [server,setServer]=useState(null),[checking,setChecking]=useState(true),[staging,setStaging]=useState(false),[error,setError]=useState(''),[reviewAttempt,setReviewAttempt]=useState(0);
  const source={backup,report,payload,recipeRevision:catalog.revision,packId:recipe.id},requestBody=selection=>({container:payload.container,payload:payload.name,packId:recipe.id,recipeRevision:catalog.revision,selection,drafts});
  useEffect(()=>{const previous=document.activeElement;dialog.current?.querySelector('button')?.focus();return()=>previous?.focus({preventScroll:true});},[]);
  useEffect(()=>{
    let active=true;const version=++generation.current;setChecking(true);setServer(null);setError('');
    services.query('crimson.pack-preview',requestBody('review')).then(result=>{if(active&&version===generation.current)setServer(result);}).catch(e=>{if(active&&version===generation.current)setError(e.message||'This pack could not be checked.');}).finally(()=>{if(active&&version===generation.current)setChecking(false);});
    return()=>{active=false;generation.current++;};
  },[recipe.id,catalog.revision,context,reviewAttempt]);
  const preview=server?.preview||localPreview,entries=preview?.entries||EMPTY,summary=preview?.summary||{},ready=Boolean(server?.preview),partial=Boolean(summary.unavailable||preview?.omitted?.length),changes=summary.changes||preview?.stagedOperations?.length||0;
  async function stage(selection){
    if(disabled||checking||staging||!ready)return;
    const expectedContext=contextRef.current,version=++generation.current;setStaging(true);setError('');
    try{
      const result=await services.query('crimson.pack-preview',requestBody(selection));
      if(version!==generation.current||contextRef.current!==expectedContext)throw Error('Your save or draft changed. Open this pack again before staging.');
      if(result.recipeRevision!==catalog.revision||result.backupId!==backup.id||result.container!==payload.container||result.payloadSha256!==payload.sha256)throw Error('This pack check belongs to a different save. Open it again.');
      const combined=await assertCompiledPack(result,source);
      if(version!==generation.current||contextRef.current!==expectedContext)throw Error('Your save or draft changed. Open this pack again before staging.');
      onStage(combined);onClose();
    }catch(e){if(version===generation.current)setError(e.message||'This pack could not be staged. Your current changes are unchanged.');}
    finally{if(version===generation.current)setStaging(false);}
  }
  function keydown(event){event.stopPropagation();if(event.key==='Escape')onClose();if(event.key==='Tab'){const controls=dialog.current?.querySelectorAll('button:not(:disabled),a[href]'),first=controls?.[0],last=controls?.[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
  return <div className="pack-modal-scrim" onClick={onClose} onKeyDown={keydown}><section className="pack-detail" ref={dialog} role="dialog" aria-modal="true" aria-label={`${recipe.name} pack`} onClick={e=>e.stopPropagation()}>
    <header className="pack-detail-heading"><PackArt pack={recipe} large/><div><span className="eyebrow">{recipe.category==='gear'?'GEAR COLLECTION':'YOUR ADVENTURE · PACKS'}</span><h2>{recipe.name}</h2><p>{recipe.description}</p></div><button className="icon-button" aria-label="Close pack details" onClick={onClose}><X size={21}/></button></header>
    <div className="pack-detail-summary"><span><CheckSquare size={17}/>{summary.alreadySatisfied||0} already covered</span><span><Package size={17}/>{changes} {changes===1?'change':'changes'} available</span>{partial?<span className="pack-unavailable"><LockSimple size={16}/>{preview?.omitted?.length||summary.unavailable||0} unavailable</span>:null}</div>
    {preview?.inventorySpace?.newItemDefinitions>0?<div className={`pack-space ${preview.inventorySpace.canFit?'ready':'warning'}`} role="status"><Backpack size={17}/><p>{preview.inventorySpace.canFit?preview.inventorySpace.automaticExpansionRequired?`Space checked · Bag size will expand ${preview.inventorySpace.oldTotalCapacity} → ${preview.inventorySpace.newTotalCapacity}.`:preview.inventorySpace.perInventory?.some(p=>p.inventoryKey!==2)?`Destinations checked · ${preview.inventorySpace.additionalSlots} new slots across your saved inventories.`:`Space checked · ${preview.inventorySpace.additionalSlots} new ${preview.inventorySpace.additionalSlots===1?'slot':'slots'} needed, ${preview.inventorySpace.freeSlots} available.`:preview.inventorySpace.warning}<small>SaveRift expands your bag only as needed, up to its current 250-slot limit.</small></p></div>:null}
    <div className="pack-contents" aria-label="Exact pack contents">{entries.map((entry,index)=><article key={`${entry.definitionKey||'capacity'}-${index}`} className={`pack-content-row ${entry.status}`}>
      <span className="pack-content-art">{packItemArtwork(recipe,entry)?<PluginImage src={packItemArtwork(recipe,entry)} alt="" loading="lazy"/>:entry.kind==='capacity'||!entry.definitionKey?<Backpack size={23}/>:<Package size={23}/>}</span><div className="pack-content-name"><strong>{entry.displayName}</strong><span>{packEntryStatus(entry)}{advanced&&entry.definitionKey?` · ${entry.definitionKey}`:''}</span></div>
      <div className="pack-content-values">{entry.status==='satisfied'?<span className="pack-value-covered"><CheckCircle size={16}/>{numbers(entry.effective??entry.current)}</span>:entry.status==='ready'?<><span>{numbers(entry.effective??entry.current)}</span><ArrowRight size={14}/><strong>{numbers(entry.after??entry.target)}</strong></>:<span className="pack-missing-value">{numbers(packOwnershipLabel(entry))}<small>Target {numbers(entry.target)}</small></span>}</div>
    </article>)}</div>
    {partial?<p className="pack-eligibility-note"><LockSimple size={17}/>{changes?'Only the listed available changes can be staged. Unsupported contents are left unchanged.':'This save has no supported changes for this collection. The listed compatibility reasons explain what is unavailable.'}</p>:null}
    {preview?.mergeConflict?<p className="pack-eligibility-note" role="alert">{typeof preview.mergeConflict==='string'?preview.mergeConflict:'This pack conflicts with your current changes. Review or remove a change before adding it.'}</p>:null}
    {checking?<p className="pack-check-status" role="status"><SpinnerGap size={17} className="spin"/>Checking this pack against your selected save…</p>:null}
    {error?<div className="pack-error" role="alert"><p>{error}</p>{!checking&&!staging?<button className="text-button" onClick={()=>setReviewAttempt(n=>n+1)}>Check this pack again</button>:null}</div>:null}
    {advanced?<details className="pack-recipe-evidence"><summary>Recipe & compatibility details</summary><p>Recipe {recipe.id} · {catalog.revision}</p><p>Existing changes use the same pinned catalog and validated save compiler. New records, gameplay effects and engine acceptance retain separate gates.</p></details>:null}
    <footer className="pack-detail-actions"><span><ShieldCheck size={17}/>Your original stays protected.</span><button className="button secondary" onClick={onClose}>Close</button>{preview?.canStageFull?<button className="button primary" disabled={disabled||checking||staging||!ready} onClick={()=>stage('full')}>{staging?'Validating pack…':'Add pack to changes'}<CaretRight size={16}/></button>:preview?.canStageAvailable?<button className="button primary" disabled={disabled||checking||staging||!ready} onClick={()=>stage('available')}>{staging?'Validating changes…':`Add ${changes} available ${changes===1?'change':'changes'}`}<CaretRight size={16}/></button>:!changes&&!partial&&!preview?.mergeConflict?<span className="pack-already-covered"><CheckCircle size={18}/>Already covered</span>:null}</footer>
  </section></div>;
}

export function PackBrowser({backup,report,payload,drafts,onStage,disabled=false,advanced=false,requestedPack,onCloseDetail}){
  const services=useCrimsonServices();
  const [bundle,setBundle]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[category,setCategory]=useState('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState(requestedPack?.id||null);
  useEffect(()=>{let active=true;import('../../src/catalog/crimson-packs.mjs').then(module=>{if(active)setBundle({catalog:module.getPackCatalog(),preview:module.previewPack});}).catch(()=>{if(active)setError('The pack catalog could not be loaded. Please reopen Packs.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  useEffect(()=>{if(requestedPack?.id)setSelected(requestedPack.id);},[requestedPack?.id,requestedPack?.request]);
  const previews=useMemo(()=>{const values=new Map();for(const recipe of bundle?.catalog.packs||EMPTY){try{values.set(recipe.id,bundle.preview(recipe.id,{domains:payload.crimson.domains,drafts}));}catch{values.set(recipe.id,null);}}return values;},[bundle,payload,drafts]);
  const recipes=bundle?.catalog.packs||EMPTY,q=query.trim().toLowerCase(),shown=recipes.filter(pack=>(category==='all'||pack.category===category)&&(!q||`${pack.name} ${pack.description} ${pack.contents.map(c=>c.displayName).join(' ')}`.toLowerCase().includes(q))),chosen=recipes.find(p=>p.id===selected);
  return <div className="pack-browser" aria-label="Item and gear packs">
    <div className="pack-browser-intro"><div><h3>A little boost. A new adventure.</h3><p>Choose exact contents, see what fits your save, and review every change before sending.</p></div><span><ShieldCheck size={17}/>Your progress stays yours</span></div>
    <div className="pack-browser-toolbar"><nav aria-label="Pack categories">{categories.map(([key,name])=><button key={key} aria-pressed={category===key} className={category===key?'active':''} onClick={()=>setCategory(key)}>{name}</button>)}</nav><label className="pack-search"><MagnifyingGlass size={17}/><input type="search" aria-label="Search packs" placeholder="Find a pack or item…" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
    {loading?<p className="pack-check-status" role="status"><SpinnerGap size={18} className="spin"/>Opening your pack collection…</p>:null}
    {error?<p className="pack-error" role="alert">{error}</p>:null}
    <div className="pack-grid">{shown.map(pack=>{const preview=previews.get(pack.id);return <button key={pack.id} type="button" className={`pack-card ${pack.category}`} aria-label={`View ${pack.name}`} onClick={()=>setSelected(pack.id)}><CollectionBackdrop pack={pack}/><PackArt pack={pack}/><span className="pack-card-category">{categories.find(([key])=>key===pack.category)?.[1]||pack.category}</span><h4>{pack.name}</h4><p>{pack.description}</p><span className={`pack-card-availability ${preview?.canStageFull?'ready':''}`}>{previewLabel(preview)}<CaretRight size={15}/></span></button>;})}</div>
    {!loading&&!error&&!shown.length?<p className="domain-empty">No matching packs. Try a different item or category.</p>:null}
    {chosen?<PackDetail key={chosen.id} recipe={chosen} catalog={bundle.catalog} localPreview={previews.get(chosen.id)} backup={backup} report={report} payload={payload} drafts={drafts} onStage={onStage} onClose={()=>{setSelected(null);onCloseDetail?.();}} disabled={disabled} advanced={advanced}/>:null}
  </div>;
}
