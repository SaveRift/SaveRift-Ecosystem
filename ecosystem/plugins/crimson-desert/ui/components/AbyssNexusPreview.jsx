// SPDX-License-Identifier: Apache-2.0
import {useEffect,useRef,useState} from 'react';
import {CheckCircle,Compass,LockSimple,MapTrifold,SpinnerGap,TreasureChest} from '@phosphor-icons/react';
import {useCrimsonServices} from './bridge.jsx';
import {stagedCartography} from './cartography-plan.mjs';
import './abyss-nexus-preview.css';

const recipes=[
  {id:'nexus',recipe:'unlock-nexus',name:'Nexus Unlock',detail:'Discover Nexus routes · Beta',Icon:Compass,endpoint:'abyss-nexus-preview',schema:'saveglass.abyss-nexus-preview.v1'},
  {id:'map',recipe:'reveal-map',name:'Reveal Map',detail:'Remove map haze',Icon:MapTrifold,endpoint:'map-reveal-preview',schema:'saveglass.map-reveal-preview.v1'},
  {id:'treasure',name:'Reveal Treasure',detail:'Coming soon',Icon:TreasureChest,unavailable:true}
];
const blankControls=()=>Object.fromEntries(recipes.map(recipe=>[recipe.id,{selected:false,loading:false,error:'',errorCode:'',preview:null,alreadySatisfied:false}]));
function hasChanges(id,report){return id==='nexus'?Boolean((report.coverage?.addedRecords||0)+(report.coverage?.updatedLevels||0)+(report.coverage?.discoveredLocationsAdded||0)):Boolean(report.coverage?.segmentsToReveal);}
function cardStatus(recipe,entry){
  if(recipe.unavailable)return 'Coming soon';
  if(entry.loading)return 'Checking preview…';
  if(entry.error)return 'Preview unavailable';
  if(entry.preview&&entry.selected)return hasChanges(recipe.id,entry.preview)?'Ready to review':'Already enabled in this save';
  if(entry.alreadySatisfied)return 'Already enabled in this save';
  if(entry.selected)return 'Ready to review';
  return recipe.detail;
}

export function AbyssNexusPreview({backup,payload,drafts=[],onStage,onRemove,disabled=false,advanced=false}){
  const services=useCrimsonServices();
  const source=[backup?.id,payload?.container,payload?.sha256].join(':'),context=useRef(source),generation=useRef({nexus:0,map:0,treasure:0});
  const callbacks=useRef({onStage,onRemove});callbacks.current={onStage,onRemove};
  const [state,setState]=useState(()=>({source,controls:blankControls()}));context.current=source;
  const local=state.source===source?state.controls:blankControls(),controls=Object.fromEntries(recipes.map(recipe=>[recipe.id,{...local[recipe.id],selected:local[recipe.id].loading||drafts.some(d=>d.recipe===recipe.recipe&&d.schema==='saveglass.cartography-staged.v1')} ]));
  useEffect(()=>{
    for(const key of Object.keys(generation.current))generation.current[key]++;
    setState({source,controls:blankControls()});
    return()=>{for(const key of Object.keys(generation.current))generation.current[key]++;};
  },[source]);
  function update(id,patch){setState(previous=>{const current=previous.source===source?previous.controls:blankControls();return {source,controls:{...current,[id]:{...current[id],...patch}}};});}
  async function toggle(recipe,selected){
    if(disabled||recipe.unavailable||!backup?.id||!payload?.container||!payload?.sha256)return;
    const version=++generation.current[recipe.id],expected=source;
    if(!selected){onRemove?.(recipe.recipe);update(recipe.id,{selected:false,loading:false,error:'',preview:null});return;}
    update(recipe.id,{selected:true,loading:true,error:'',preview:null});
    try{
      const result=await services.query(recipe.recipe==='reveal-map'?'crimson.map-preview':'crimson.nexus-preview',{container:payload.container}),preview=result.preview||result;
      if(version!==generation.current[recipe.id]||expected!==context.current)return;
      if(result.backupId!==undefined&&result.backupId!==backup.id||result.container!==undefined&&result.container!==payload.container||result.payloadSha256!==undefined&&result.payloadSha256!==payload.sha256||preview.schema!==recipe.schema||preview.sourceSha256!==payload.sha256||preview.canSend!==false||preview.cloudRequests!==0||preview.sourceSaveUnchanged!==true)throw Error('This preview could not be matched to your selected save. Try the switch again.');
      const changed=hasChanges(recipe.id,preview);
      if(changed&&callbacks.current.onStage?.(stagedCartography(recipe.recipe))===false)throw Error('This change could not be added to your current queue. Review the queued changes and try again.');
      update(recipe.id,{selected:changed,loading:false,preview,alreadySatisfied:!changed});
    }catch(error){if(version===generation.current[recipe.id]&&expected===context.current)update(recipe.id,{selected:false,loading:false,preview:null,errorCode:error.code||'',error:/^CRIMSON_(?:NEXUS|MAP)_.*(?:SCHEMA|DESCRIPTOR|LAYOUT)_UNSUPPORTED$/.test(error.code||'')?'This save layout is not supported for this change yet. Choose another save.':error.message||'This change could not be previewed.'});}
  }
  const selected=recipes.filter(recipe=>controls[recipe.id].selected),ready=selected.filter(recipe=>controls[recipe.id].preview),checking=selected.filter(recipe=>controls[recipe.id].loading),errors=recipes.filter(recipe=>controls[recipe.id].error);
  return <section className="map-discovery-controls" aria-label="Map discovery previews">
    <header className="map-discovery-heading"><h3>More of Pywel, revealed.</h3><span>Choose a change</span></header>
    <div className="map-discovery-toggle-grid">{recipes.map(recipe=>{const entry=controls[recipe.id],Icon=recipe.Icon,unavailable=disabled||recipe.unavailable||!backup?.id||!payload?.sha256;return <label key={recipe.id} className={`map-discovery-card ${entry.selected?'selected':''} ${recipe.unavailable?'coming-soon':''}`}>
      <span className="map-discovery-card-top"><Icon size={23} weight="duotone"/><span className="discovery-switch"><input type="checkbox" role="switch" aria-label={recipe.name} aria-checked={entry.selected} checked={entry.selected} disabled={unavailable} onChange={event=>toggle(recipe,event.target.checked)}/><span className="discovery-switch-track" aria-hidden="true"><span/></span></span></span>
      <strong>{recipe.name}</strong><small>{entry.loading?<SpinnerGap size={12} className="spin"/>:entry.preview?<CheckCircle size={12}/>:recipe.unavailable?<LockSimple size={11}/>:null}{cardStatus(recipe,entry)}</small>
    </label>;})}</div>
    <p className="map-discovery-caption">Choose your changes, then review and send them together.</p>
    {controls.nexus.selected?<p className="map-discovery-caption">Nexus Unlock is in beta. Its location-discovery fix still needs an in-game check on an edited save.</p>:null}
    {checking.length||ready.length?<p className="map-discovery-status" role="status">{checking.length?<><SpinnerGap size={14} className="spin"/>{checking.map(recipe=>recipe.name).join(' and ')} {checking.length===1?'is':'are'} being checked.</>:<><CheckCircle size={14}/>{ready.map(recipe=>recipe.name).join(' and ')} {ready.length===1?'is':'are'} ready to review below.</>}</p>:null}
    {errors.map(recipe=><p className="map-discovery-error" key={recipe.id} role="alert">{recipe.name}: {controls[recipe.id].error}{advanced&&controls[recipe.id].errorCode?<><br/><code>{controls[recipe.id].errorCode}</code></>:null}</p>)}
    {advanced&&ready.length?<details className="map-discovery-evidence"><summary>Preview details</summary>{ready.map(recipe=>{const report=controls[recipe.id].preview;return <div key={recipe.id}><h4>{recipe.name}</h4><p>{recipe.id==='nexus'?'Nexus knowledge and the matching location-discovery records are checked together. Unrelated discoveries and the fog array stay unchanged.':'Only the saved map-fog codes are changed. Nexus discovery and treasure state stay unchanged.'}</p><pre>{JSON.stringify({coverage:report.coverage,validation:report.validation,decodedDiff:report.decodedDiff,gameAcceptance:report.gameAcceptance},null,2)}</pre></div>;})}</details>:null}
  </section>;
}
