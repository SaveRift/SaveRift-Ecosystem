import {PluginImage} from './PluginImage.jsx';
// SPDX-License-Identifier: Apache-2.0
import {useEffect,useId,useRef,useState} from 'react';
import {ArrowSquareOut,BookOpen,Compass,House,LockSimple,MapPin,Mountains,Sparkle,TreasureChest,Users,X} from '@phosphor-icons/react';
import {normalizeAdventure} from '../../src/catalog/crimson-adventure.mjs';
import {estimateStoryProgress} from './story-progress.mjs';
import './crimson-adventure.css';

const display=value=>value===null||value===undefined?'Not stored':Array.isArray(value)?value.map(n=>Number.isFinite(n)?Number(n.toFixed(2)):String(n)).join(', '):String(value);
const fieldLabel=key=>key.replace(/^_/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
const stateText=state=>state?.present?display(state.value):'Not stored';
function Stat({label,state,value}){return <div className="adventure-stat"><span>{label}</span><strong>{state?stateText(state):display(value)}</strong></div>;}
function adventureData(progress,companions){return progress?.adventure??normalizeAdventure({character:progress?.character,quests:progress?.quests,companions});}

function CharacterCard({character}){
  const [failed,setFailed]=useState(false),storyGate=character.storyChapter>0&&character.available!==true;
  return <article className={`adventure-character ${character.active?'is-active':''} ${storyGate?'story-gate-preview':''}`} aria-label={`${character.name} character status`}>
    <div className="adventure-character-art">{!failed?<PluginImage src={character.portrait} alt={character.name} loading="lazy" onError={()=>setFailed(true)}/>:<Users size={60} weight="duotone"/>}{character.active?<span className="character-current">Current character</span>:null}{storyGate?<div className="character-story-gate"><LockSimple size={23}/><strong>Story unlock · Chapter {character.storyChapter}</strong><span>Availability in this save is not verified.</span></div>:null}</div>
    <div className="adventure-character-content"><span className="eyebrow">{character.role}</span><h3>{character.name}</h3><div className="adventure-character-stats"><Stat label="Current HP" state={character.currentHp}/><Stat label="Current MP" state={character.currentMp}/></div>{character.active?<p>Values from your saved adventure.</p>:<p>{character.recordState==='recorded'?'A character record is present. It does not confirm story access.':'Story access will appear here once its save flags are mapped.'}</p>}</div>
  </article>;
}

export function CharacterAndProgress({progress={},companions=[],advanced=false,headingId}){
  const data=adventureData(progress,companions),estimate=estimateStoryProgress(data.chapter);
  return <div className="progress-domain adventure-progress">
    <section className="adventure-journal" aria-label="Story progress"><div><BookOpen size={23}/><h2 id={headingId} className="progress-title">Your Progress</h2><h3>{data.chapter?`${data.chapter.label} · ${data.chapter.title}`:'The story continues'}</h3>
      {estimate?<div className="chapter-progress"><div><span>{estimate.label}</span><strong>About {estimate.percent}%</strong></div><progress aria-label="Estimated story progress" max="100" value={estimate.percent}/><p>{estimate.detail}</p></div>:<p className="chapter-progress-unavailable">A chapter estimate will appear when this save’s story chapter is mapped.</p>}
    </div><div className="adventure-journal-stats"><Stat label="Knowledge entries" value={progress.knowledge?.recordCount}/><Stat label="Follow-learn entries" value={progress.knowledge?.followLearnRecordCount}/></div></section>
    <p className="domain-intro">Your Greymanes, as they appear in this snapshot. Story and character editing are coming soon.</p>
    <div className="adventure-character-grid">{data.characters.map(c=><CharacterCard key={c.characterKey} character={c}/>)}</div>
    {advanced?<details className="domain-sample"><summary>Character and journal details</summary><p className="domain-intro">Character identity uses native CharacterKey. Skill-point owner types are not yet mapped to those identities; row order is not treated as a character name. Character records alone do not prove unlock state.</p><div className="adventure-raw-skills">{progress.skillPoints?.map((p,i)=><article key={i}><h4>Skill owner type {stateText(p.ownerType)}</h4><Stat label="Available skill points" state={p.current}/><Stat label="Elapsed skill points" state={p.elapsed}/></article>)}</div><dl>{Object.entries(progress.quests?.counts??{}).map(([k,v])=><div key={k}><dt>{fieldLabel(k)}</dt><dd>{display(v)}</dd></div>)}</dl><p className="domain-intro">Stored record counts do not imply completion or Xbox achievement awards. The chapter bar is a rough story estimate; it does not measure side content, prologue or epilogue completion.</p><p className="adventure-attribution">Character artwork and story chapter references: <a href="https://crimsondb.gg/characters" target="_blank" rel="noreferrer">CrimsonDB <ArrowSquareOut size={12}/></a></p></details>:null}
  </div>;
}

export function ProgressDialog({progress,companions,advanced=false,onClose}){
  const dialog=useRef(null),headingId=useId();
  useEffect(()=>{
    const node=dialog.current,previous=document.activeElement,overflow=document.body.style.overflow;
    // A native modal dialog keeps the rest of the page inert, traps focus and
    // enters the top layer without a custom fixed-position stacking workaround.
    node.showModal();document.body.style.overflow='hidden';node.querySelector('button')?.focus();
    return()=>{if(node.open)node.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <dialog className="progress-dialog crimson-explorer" ref={dialog} aria-labelledby={headingId} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();}}} onKeyDown={event=>event.stopPropagation()}>
    <div className="progress-dialog-toolbar"><span className="eyebrow">CRIMSON DESERT · YOUR ADVENTURE</span><button type="button" className="icon-button" aria-label="Close progress" onClick={onClose}><X size={23}/></button></div>
    <CharacterAndProgress progress={progress} companions={companions} advanced={advanced} headingId={headingId}/>
  </dialog>;
}

const destinations=[{name:'Hernand',detail:'Town',Icon:MapPin},{name:'Your home',detail:'Player housing',Icon:House},{name:'Greymane Camp',detail:'Home base',Icon:House},{name:'Pailune',detail:'City',Icon:Mountains},{name:'Demeniss',detail:'City',Icon:MapPin},{name:'Delesyia',detail:'City',Icon:MapPin}];

export function LocationAndPins({location,advanced=false,nexusPreview=null}){
  const index=location.activeTransformIndex,selected=Number.isInteger(index)?location.transforms?.[index]:null;
  const [mapFailed,setMapFailed]=useState(false);
  return <div className="location-domain adventure-location">
    {nexusPreview}
    <div className="adventure-world-map"><div className="adventure-map-art" aria-hidden="true">{!mapFailed?<PluginImage src="/assets/crimsondb/map/pywel-overview.webp" alt="" loading="lazy" onError={()=>setMapFailed(true)}/>:<Compass size={160} weight="thin"/>}</div><div className="adventure-map-content"><span className="eyebrow">PYWEL · YOUR WORLD</span><h3>A whole world ahead.</h3><p>Keep your bearings. Choose a familiar destination when safe travel is ready.</p><a className="button secondary" href="https://crimsondb.gg/map" target="_blank" rel="noreferrer">Explore the map <ArrowSquareOut size={14}/></a><span className="map-preview-caption">Map preview · Player positioning coming soon</span></div><div className="saved-location-summary map-saved-position"><MapPin size={23}/><div><h3>Your saved position</h3><p>{selected?.position?.present?display(selected.position.value):'Your active saved position is not uniquely mapped.'}</p><small>World coordinates · {display(location.pins?.recordCount)} saved map pins</small></div></div></div>
    <section className="adventure-destinations" aria-label="Travel destinations"><header><h3>Go somewhere familiar.</h3><span>Teleportation coming soon</span></header><div>{destinations.map(({name,detail,Icon})=><button key={name} type="button" disabled aria-label={`Teleport to ${name}, teleportation coming soon`}><Icon size={21}/><span><strong>{name}</strong><small>{detail}</small></span><LockSimple size={14}/></button>)}</div><p>Teleporting needs a verified landing height and world field for each destination. Drag-to-travel will stay unavailable until those checks are reliable.</p></section>
    {advanced?<details className="domain-sample"><summary>Stored location and map details</summary><p className="domain-intro">The world-to-map projection, vertical axis and safe ground heights are unverified. The preview does not place a guessed player marker. Fog reveal and Nexus knowledge use separate offline previews. Treasure-icon discovery remains under investigation.</p>{location.transforms?.map((t,i)=><dl key={i}><div><dt>Saved field {i+1}</dt><dd>{stateText(t.fieldKey)}</dd></div><div><dt>World coordinates</dt><dd>{stateText(t.position)}</dd></div><div><dt>Quaternion</dt><dd>{stateText(t.rotation)}</dd></div><div><dt>Field clock</dt><dd>{stateText(t.fieldTimeRaw)}</dd></div></dl>)}</details>:null}
  </div>;
}
