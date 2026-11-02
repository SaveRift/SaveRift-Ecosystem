import {PluginImage} from './PluginImage.jsx';
// SPDX-License-Identifier: Apache-2.0
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {ArrowRight,Campfire,CaretLeft,CaretRight,CheckCircle,Compass,Crown,LockSimple,MagnifyingGlass,Package,ShieldCheck,SpinnerGap,Users,X} from '@phosphor-icons/react';
import {useCrimsonServices} from './bridge.jsx';
import {crimsonSaveSlotName} from './save-slot-labels.mjs';
import './save-presets.css';

const EMPTY=[];
const stages={starter:{label:'A fresh beginning',Icon:Campfire},midgame:{label:'A head start',Icon:Compass},endgame:{label:'Beyond the journey',Icon:Crown}};
const count=value=>value===null||value===undefined?'—':/^\d+$/.test(String(value))?BigInt(value).toLocaleString():String(value);
const names={inventoryRecords:'Inventory records',carriedInventoryRecords:'Carried items',companions:'Companions',pets:'Pets',mounts:'Mounts',knowledgeRecords:'Knowledge records',questRecords:'Quest records'};
const fallbackName=name=>crimsonSaveSlotName(name)||name;
const fallbackTime=value=>value||'Time unavailable';
function PresetDestination({plan,onOverwriteChange,formatName=fallbackName,formatTime=fallbackTime,advanced=false,disabled=false,summaryOnly=false}){
  const id=useId(),candidate=plan?.mode==='new_slot_candidate',overwrite=plan?.mode==='overwrite_existing';
  const label=candidate?`New save · ${fallbackName(plan.container)}`:overwrite&&plan.container?`Overwrite · ${formatName(plan.container)}`:overwrite?'Choose a save to overwrite':'Destination under validation';
  return <section className={`preset-destination${summaryOnly?' compact':''}`} aria-label={summaryOnly?'Preview preset destination':'Planned preset destination'}><div className="preset-destination-heading"><div><span className="eyebrow">{summaryOnly?'PLANNED DESTINATION':'YOUR PRESET SAVE'}</span><strong>{label}</strong></div><span><LockSimple size={14}/>Import under validation</span></div>
    {overwrite&&!summaryOnly?<label className="preset-overwrite-picker" htmlFor={id}><span>Overwrite destination</span><select id={id} aria-label="Choose a save to overwrite" value={plan.container||''} disabled={disabled} onChange={event=>onOverwriteChange?.(event.target.value)}><option value="" disabled>Choose a save to overwrite</option>{plan.options.map(option=><option key={option.name} value={option.name} disabled={option.disabled}>{formatName(option.name)} · {option.saveTimestamp?formatTime(option.saveTimestamp):'Time unavailable'}{option.protected?' · Protected reference':''}</option>)}</select></label>:null}
    {!summaryOnly?<p>{overwrite?'Choose an existing save for this separate adventure. Save 9 remains protected.':'Your current adventure stays separate. The destination will be checked before import becomes available.'}</p>:null}
    {advanced?<p className="preset-destination-evidence">{candidate?'This is a missing entry in the observed index, not a verified empty in-game slot. Server-side new-slot, recipient and revision checks are still required.':overwrite?'This choice records an intended destination only. It does not approve an overwrite or establish a current revision.':'No verified import destination is available.'}{plan?.container?` Cloud target: ${plan.container}.`:''}</p>:null}
  </section>;
}
function RecordArt({record,companion=false}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[record.iconUrl]);
  const Icon=companion?Users:Package;
  return record.iconUrl&&!failed?<PluginImage src={record.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<Icon size={24} weight="duotone"/>;
}
function useModalFocus(dialog){
  useEffect(()=>{const previous=document.activeElement;dialog.current?.querySelector('button')?.focus();return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[dialog]);
}
function modalKeys(event,dialog,onClose){
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();onClose();return;}
  if(event.key!=='Tab')return;
  const controls=dialog.current?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary'),first=controls?.[0],last=controls?.[controls.length-1];
  if(first&&event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(last&&!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
}
function PresetDetail({preset,onClose,advanced,backdrop,destinationPlan,formatSaveName,formatSaveTime}){
  const services=useCrimsonServices();
  const dialog=useRef(null),[preview,setPreview]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[tab,setTab]=useState('inventory'),[query,setQuery]=useState(''),[page,setPage]=useState(0);
  useModalFocus(dialog);
  useEffect(()=>{
    let active=true;setLoading(true);setPreview(null);setError('');
    services.query('crimson.preset-preview',{presetId:preset.id}).then(value=>{
      if(value.source!=='licensed_reference_preset'||value.readonly!==true||value.preset?.id!==preset.id||value.replacesAdventure!==true||value.publication?.enabled!==false||value.rawSaveIncluded!==false||value.liveAccountModified!==false)throw Error('This reference could not be verified as a read-only preset.');
      if(active)setPreview(value);
    }).catch(e=>{if(active)setError(e.message||'This reference preview could not be loaded.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[preset.id,retry]);
  const inventory=preview?.domains?.inventory?.records||EMPTY,companions=preview?.domains?.companions||EMPTY,q=query.trim().toLowerCase();
  const matching=useMemo(()=>inventory.filter(row=>!q||`${row.displayName||''} ${row.internalName||''} ${row.category||''} ${advanced?row.definitionKey:''}`.toLowerCase().includes(q)),[inventory,q,advanced]);
  const pages=Math.max(1,Math.ceil(matching.length/35)),currentPage=Math.min(page,pages-1),progress=preview?.domains?.progress||{},summary=preview?.preset?.summary||preset.summary||{},reasons=preview?.publication?.reasons||preset.publication?.reasons||EMPTY,loadConfirmed=(preview?.publication||preset.publication)?.acceptance?.gameLoad==='confirmed';
  const changeTab=value=>{setTab(value);setQuery('');setPage(0);};
  return <div className="preset-modal-scrim" onClick={onClose} onKeyDown={event=>modalKeys(event,dialog,onClose)}><section className="preset-detail" role="dialog" aria-modal="true" aria-label={`${preset.name} reference preview`} ref={dialog} onClick={event=>event.stopPropagation()}>
    <header className="preset-detail-heading">{backdrop?<PluginImage className="preset-detail-backdrop" src={backdrop} alt=""/>:null}<div><span className="eyebrow">REFERENCE PRESET · READ-ONLY</span><h2>{preset.name}</h2><p>{preset.description}</p></div><button className="icon-button" aria-label="Close reference preset" onClick={onClose}><X size={22}/></button></header>
    <p className="preset-replacement-note"><ShieldCheck size={19}/><span>This is a separate adventure. Importing over an existing save would replace that destination’s progress. Opening this preview leaves your Xbox save and current changes untouched.</span></p>
    <PresetDestination plan={destinationPlan} formatName={formatSaveName} formatTime={formatSaveTime} advanced={advanced} summaryOnly/>
    <div className="preset-summary" aria-label="Reference preset summary">{['inventoryRecords','companions','pets','mounts'].map(key=><div key={key}><strong>{count(summary[key])}</strong><span>{names[key]}</span></div>)}</div>
    <nav className="preset-domain-tabs" aria-label="Reference preset sections">{[['inventory',`Inventory${preview?` · ${count(inventory.length)}`:''}`],['companions',`Companions${preview?` · ${count(companions.length)}`:''}`],['progress','Progress']].map(([key,label])=><button key={key} aria-pressed={tab===key} className={tab===key?'active':''} onClick={()=>changeTab(key)}>{label}</button>)}</nav>
    {loading?<p className="preset-loading" role="status"><SpinnerGap size={18} className="spin"/>Loading the reference adventure…</p>:null}
    {error?<div className="preset-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>setRetry(n=>n+1)}>Load preview again</button></div>:null}
    {preview&&tab==='inventory'?<><label className="preset-search"><MagnifyingGlass size={18}/><input type="search" aria-label="Search reference inventory" placeholder={advanced?'Search items, categories or item IDs…':'Search this reference inventory…'} value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label><div className="preset-record-grid" aria-label="Reference inventory">{matching.slice(currentPage*35,(currentPage+1)*35).map((row,index)=><article key={`${row.definitionKey}-${row.inventoryKey}-${row.slot}-${index}`}><span className="preset-record-art"><RecordArt record={row}/></span><div><strong>{row.displayName||'Unmapped item'}</strong><small>{row.category||'Unmapped'}{advanced?` · ID ${row.definitionKey} · Bag ${row.inventoryKey}`:''}</small></div><span className="preset-record-count">× {count(row.quantity)}</span></article>)}</div>{!matching.length?<p className="domain-empty">No matching items in this reference.</p>:null}<div className="preset-pagination"><span>{count(matching.length)} items · Page {currentPage+1} of {pages}</span><button className="icon-button" aria-label="Previous reference inventory page" disabled={currentPage===0} onClick={()=>setPage(n=>Math.max(0,n-1))}><CaretLeft size={19}/></button><button className="icon-button" aria-label="Next reference inventory page" disabled={currentPage+1>=pages} onClick={()=>setPage(n=>n+1)}><CaretRight size={19}/></button></div></>:null}
    {preview&&tab==='companions'?<div className="preset-companions" aria-label="Reference companions">{companions.map((row,index)=><article key={`${row.characterKey}-${index}`}><span className="preset-record-art"><RecordArt record={row} companion/></span><div><strong>{row.displayName||'Unmapped companion'}</strong><small>{row.classification||'Companion'}{advanced?` · Character ${row.characterKey}`:''}</small></div></article>)}{!companions.length?<p className="domain-empty">No companions recorded in this reference.</p>:null}</div>:null}
    {preview&&tab==='progress'?<div className="preset-progress"><p>Recorded state from this reference adventure. Counts describe saved records; they do not imply every quest or achievement is complete.</p><dl>{[['Knowledge records',progress.knowledgeRecords],['Quest records',progress.questRecords],['Mission records',progress.missionRecords],['Skill records',progress.skillRecords],['Equipment records',preview.domains?.equipment?.equipmentRecords]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{count(value)}</dd></div>)}</dl>{preset.stage==='starter'?<p className="preset-context-note"><Compass size={17}/>This supplied starter is the reference for the Abyss Nexus feature. Applying a Nexus-only recipe to your current adventure is a separate option.</p>:null}</div>:null}
    <div className="preset-import-gate"><LockSimple size={18}/><div><strong>{loadConfirmed?'Start Smart has passed an Xbox load test.':'Xbox import is under validation.'}</strong><p>{loadConfirmed?'Import from this picker is not released yet. The normal review-and-send flow still needs its preset delivery and destination checks. Existing saves stay unchanged.':'Reference previews are ready. Import needs recipient compatibility and an in-game round trip before it can replace a save.'}</p>{advanced&&reasons.length?<ul>{reasons.map((reason,index)=><li key={reason.code||index}>{typeof reason==='string'?reason:reason.label||reason.code}</li>)}</ul>:null}</div></div>
    {advanced?<details className="preset-provenance"><summary>Reference source & validation</summary><p>{preset.source?.label} · {preset.source?.gameBuildLabel||'Build not independently mapped'}</p><p>Source permission: {preset.source?.permission||'Owner-authorized reference use'}</p><p className="mono">Schema {preset.source?.schemaSha256}</p><p>HMAC: {preset.validation?.hmacVerified?'verified':'not verified'} · Typed traversal: {preset.validation?.fullTypedTraversal?'verified':'not verified'} · Encode no-op: {preset.validation?.nativeNoOpByteParity===true?'byte-identical':preset.validation?.encoderLimitExceeded?'above current encoder limit':'not established'}</p></details>:null}
    <footer className="preset-detail-actions"><span><CheckCircle size={17}/>Your current adventure is unchanged</span><button className="button secondary" onClick={onClose}>Back to presets</button><button className="button primary" disabled><LockSimple size={16}/>Import to Xbox</button></footer>
  </section></div>;
}

export function SavePresets({game,disabled=false,advanced=false,destinationPlan,onOverwriteChange,formatSaveName,formatSaveTime}){
  const services=useCrimsonServices();
  const [catalog,setCatalog]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[chosen,setChosen]=useState(null);
  useEffect(()=>{let active=true;setLoading(true);setError('');services.query('crimson.presets').then(value=>{if(value.source!=='licensed_reference_preset'||value.readonly!==true||!Array.isArray(value.presets))throw Error('The reference catalog could not be verified.');if(active)setCatalog(value);}).catch(e=>{if(active)setError(e.message||'The preset library could not be opened.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[retry]);
  const backdrop=game?.hero||game?.poster||'/assets/crimsondb/map/pywel-overview.webp';
  return <section className="save-presets" aria-label="Save presets"><header className="preset-library-intro"><div><span className="eyebrow">CRIMSON DESERT · SAVE PRESETS</span><h3>Another way into Pywel.</h3><p>Choose Start Smart, Midgame or Endgame.</p></div><span><ShieldCheck size={18}/>Separate from your current save</span></header>
    <p className="preset-library-note">Build a separate adventure from a preset. To keep your own story, use a targeted change such as the Nexus-only preview.</p>
    <PresetDestination plan={destinationPlan} onOverwriteChange={onOverwriteChange} formatName={formatSaveName} formatTime={formatSaveTime} advanced={advanced} disabled={disabled}/>
    {loading?<p className="preset-loading" role="status"><SpinnerGap size={18} className="spin"/>Opening the preset library…</p>:null}
    {error?<div className="preset-error" role="alert"><p>{error}</p><button className="text-button" onClick={()=>setRetry(n=>n+1)}>Open library again</button></div>:null}
    <div className="save-preset-grid">{(catalog?.presets||EMPTY).map(preset=>{const stage=stages[preset.stage]||stages.midgame,Icon=stage.Icon;return <article className={`save-preset-card ${preset.stage}`} key={preset.id}><PluginImage className="save-preset-backdrop" src={backdrop} alt="" loading="lazy"/><span className="preset-stage-art"><Icon size={37} weight="duotone"/></span><span className="eyebrow">{stage.label}</span><h4>{preset.name}</h4><p>{preset.description}</p><div className="preset-card-stats"><span>{count(preset.summary?.inventoryRecords)} inventory records</span><span>{count(preset.summary?.companions)} companions</span></div><button className="button secondary" disabled={disabled} onClick={()=>setChosen(preset)}>Load reference preview<ArrowRight size={16}/></button><small>{preset.publication?.acceptance?.gameLoad==='confirmed'?'Xbox load confirmed · Import not released':'Read-only · Xbox import under validation'}</small></article>;})}</div>
    {chosen?<PresetDetail key={chosen.id} preset={chosen} onClose={()=>setChosen(null)} advanced={advanced} backdrop={backdrop} destinationPlan={destinationPlan} formatSaveName={formatSaveName} formatSaveTime={formatSaveTime}/>:null}
  </section>;
}
