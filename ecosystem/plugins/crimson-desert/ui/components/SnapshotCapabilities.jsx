// SPDX-License-Identifier: Apache-2.0
import {useEffect,useState} from 'react';
import {CheckCircle,Info,LockSimple} from '@phosphor-icons/react';
import {useCrimsonServices} from './bridge.jsx';

const labels={decode:'Read decoded data',preview:'Change validation',edit_existing:'Existing quantities',edit_capacity:'Bag capacity',insert_item:'Add items',edit_companion:'Add companions',publish:'Send reviewed changes',restore:'Restore to Xbox'};
export function SnapshotCapabilities({backupId,container,payload}){
  const services=useCrimsonServices();
  const [result,setResult]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;setResult(null);setError('');services.query('crimson.capabilities').then(v=>{if(active)setResult(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[backupId]);
  const selected=result?.payloads.find(p=>p.container===container&&p.name===payload);
  return <details className="catalog-provenance snapshot-capabilities"><summary>Support for this snapshot</summary>
    {error?<p role="alert">{error}</p>:!result?<p role="status">Checking snapshot compatibility…</p>:selected?<>
      <p><Info size={17}/>Support is checked for this save and the selected change. Each edit is validated again before sending.</p>
      <div className="snapshot-capability-grid">{Object.entries(labels).map(([key,label])=>{const cap=selected.capabilities[key];return <article key={key}><strong>{cap?.available?<CheckCircle size={16}/>:<LockSimple size={16}/>} {label}</strong><span>{cap?.reason||'Not established for this snapshot.'}</span></article>;})}</div>
      <p className="small">Compatibility follows the saved layout. New record families and restoration retain separate checks.</p>
    </>:<p>No game-specific adapter matches this payload. Private download remains available.</p>}
  </details>;
}
