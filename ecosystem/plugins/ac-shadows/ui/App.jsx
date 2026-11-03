// SPDX-License-Identifier: Apache-2.0
import {useEffect, useRef, useState} from 'react';
import {editRequest, FIELD_OPERATIONS, fieldForOperation, isAcOperation, pendingValue} from './model.mjs';

export function ShadowsEditor({client, initialSummary, initialPage, initialDraft}) {
  const [summary] = useState(initialSummary), [page, setPage] = useState(initialPage);
  const [draft, setDraft] = useState(initialDraft), [search, setSearch] = useState(''), [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(initialPage.records[0] || null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('Your original selection is unchanged.');
  const requestNumber = useRef(0), currentDraft = useRef(draft); currentDraft.current = draft;
  useEffect(() => {
    let active = true;
    const stop = client.onDraft(next => { if (active) setDraft(next); });
    client.subscribeDraft().catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; stop?.(); };
  }, [client]);
  async function loadPage(nextFilter, offset = 0) {
    const request = ++requestNumber.current; setLoading(true); setError('');
    try {
      const next = await client.query({method: 'acshadows.inventory.list', args: {search: nextFilter, offset, limit: 50}});
      if (request !== requestNumber.current) return;
      setPage(next); setFilter(nextFilter); setSelected(next.records[0] || null);
    } catch (cause) { if (request === requestNumber.current) setError(cause.message); }
    finally { if (request === requestNumber.current) setLoading(false); }
  }
  async function stage(record, field, value) {
    setBusy(true); setError('');
    try {
      const request = editRequest(currentDraft.current, record, field, value, summary.sourceSha256, summary.capabilities?.maxOperations || 16);
      if (!request.operations.length && !request.removeInstanceIds.length) { setStatus('That value already matches the original selection.'); return; }
      const next = await client.stage(request); setDraft(next);
      setStatus(`${FIELD_OPERATIONS[field].label} saved to shared draft revision ${next.revision}.`);
    } catch (cause) { setError(cause.message || 'The change could not be staged. Reload the draft and retry.'); }
    finally { setBusy(false); }
  }
  async function remove(operation) {
    setBusy(true); setError('');
    try { setDraft(await client.removeOperation({expectedRevision: currentDraft.current.revision, instanceId: operation.instanceId})); setStatus('Change removed from the shared draft.'); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true);
    try { setDraft(await client.getDraft()); setError(''); setStatus('Shared draft refreshed.'); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  }
  const changes = draft.operations.filter(isAcOperation), otherCount = draft.operations.length - changes.length;
  const nativeSave = summary.capabilities?.nativeWrappedSave === true;
  return <main className="shadows-editor">
    <header><div><p className="eyebrow">SAVERIFT · DEVELOPER PREVIEW</p><h1>Assassin’s Creed Shadows</h1><p className="subtitle">Inspect your inventory. Stage precise changes. Review before downloading.</p></div><span className="pill">{nativeSave ? 'PC save editor' : 'PC context editor'}</span></header>
    <div className="scope"><strong>{nativeSave ? 'Prepared PC save · version 54' : 'Selected native inventory context'}</strong><span>{nativeSave ? 'This selection uses the prepared PC save format and a separately selected private format key. The download is a native save candidate; this package has not been tested loading it in the game. Xbox formats are unsupported.' : 'This build edits a decoded PC inventory context. The download needs the established PC save repacking workflow before use in the game. Compressed saves require the local preparation step; Xbox saves are unsupported.'}</span></div>
    <section className="summary" aria-label="Selection summary"><div><span>Inventory records</span><strong>{summary.inventoryCount}</strong></div><div><span>Shared draft</span><strong>Revision {draft.revision}</strong></div><div><span>Staged changes</span><strong>{changes.length}</strong></div></section>
    <div role="status" className="status">{status}</div>
    {error && <div role="alert" className="error">{error} <button type="button" onClick={refresh} disabled={busy}>Reload shared draft</button></div>}
    <div className="editor-grid"><section className="panel inventory"><div className="panel-heading"><h2>Inventory</h2><span>{page.total} matches</span></div>
      <form className="search" onSubmit={event => { event.preventDefault(); loadPage(search.trim()); }}><label htmlFor="inventory-search" className="sr-only">Search inventory by name or ID</label><input id="inventory-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or item ID" maxLength={120}/><button disabled={loading}>Search</button></form>
      <div className="records" aria-busy={loading}>{page.records.map(record => <button type="button" key={record.recordId} className={`record ${selected?.recordId === record.recordId ? 'selected' : ''}`} onClick={() => setSelected(record)} aria-pressed={selected?.recordId === record.recordId}>
        <span className="record-name">{record.displayName || `Item ${record.itemSettingsId}`}</span><span className="record-meta">{record.level > 0 ? `Level ${record.level}` : `Quantity ${record.quantity}`} · {record.itemSettingsId}</span>
      </button>)}{!page.records.length && <p className="empty">No inventory records match this search.</p>}</div>
      <nav className="pager" aria-label="Inventory pages"><button type="button" disabled={loading || page.offset === 0} onClick={() => loadPage(filter, Math.max(0, page.offset - page.limit))}>Previous</button><span>{page.total ? `${page.offset + 1}–${Math.min(page.offset + page.records.length, page.total)} of ${page.total}` : '0 records'}</span><button type="button" disabled={loading || page.offset + page.records.length >= page.total} onClick={() => loadPage(filter, page.offset + page.limit)}>Next</button></nav>
    </section><section className="panel details"><h2>{selected ? selected.displayName || `Item ${selected.itemSettingsId}` : 'Select an item'}</h2>{selected && <>
      <dl><div><dt>Item definition</dt><dd>{selected.itemSettingsId}</dd></div><div><dt>Instance</dt><dd>{selected.instanceId}</dd></div><div><dt>Character</dt><dd>{selected.characterId}</dd></div><div><dt>Original item level</dt><dd>{selected.level}</dd></div><div><dt>Original quantity</dt><dd>{selected.quantity}</dd></div></dl>
      {Object.keys(FIELD_OPERATIONS).filter(field => selected.editableFields?.includes(field)).map(field => <EditField key={`${selected.recordId}:${field}:${pendingValue(draft, selected, field)}`} field={field} record={selected} staged={pendingValue(draft, selected, field)} busy={busy || loading} onStage={stage}/>)}
      {!selected.editableFields?.length && <p className="empty">This record is read-only because its layout has not been established for an edit.</p>}
      <p className="hint">Only existing supported fields can change. Item identity, engraving assignments, and equipped-slot selection are read-only.</p>
    </>}</section></div>
    <section className="panel changes"><div className="panel-heading"><h2>Preview your changes</h2><button type="button" className="quiet" disabled={busy} onClick={refresh}>Refresh draft</button></div>
      {!changes.length ? <p className="empty">Choose an item and save an edit to see its original and proposed values here.</p> : <div className="table-wrap"><table><thead><tr><th>Record</th><th>Field</th><th>Original</th><th>Proposed</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{changes.map(operation => { const field = fieldForOperation(operation), info = FIELD_OPERATIONS[field]; return <tr key={operation.instanceId}><td className="record-id">{operation.params.recordId}</td><td>{info.label}</td><td>{operation.params[info.expected]}</td><td className="proposed">{operation.params[field]}</td><td><button type="button" disabled={busy} onClick={() => remove(operation)} aria-label={`Remove ${info.label} change for ${operation.params.recordId}`}>Remove</button></td></tr>; })}</tbody></table></div>}
      {otherCount > 0 && <p className="hint">{otherCount} change(s) from other tools remain in this shared draft.</p>}
      <div className="review"><p>Review opens SaveRift’s trusted controls. Prepare the candidate there, then download the validated output.</p><button type="button" className="primary" disabled={busy || !draft.operations.length} onClick={() => client.openReview().catch(cause => setError(cause.message))}>Review changes</button></div>
    </section>
    <details className="source"><summary>Compatibility and source evidence</summary><p>Player level, prestige, mastery, item additions, engravings, and console formats are unsupported in this build. No in-game or recovery acceptance is claimed.</p><p>Selected format: {typeof summary.format === 'string' ? summary.format : JSON.stringify(summary.format)}</p><p className="hash">SHA-256: {summary.sourceSha256}</p></details>
  </main>;
}

function EditField({field, record, staged, busy, onStage}) {
  const definition = FIELD_OPERATIONS[field], [value, setValue] = useState(String(staged));
  return <form className="edit-field" onSubmit={event => { event.preventDefault(); onStage(record, field, value === '' ? NaN : Number(value)); }}>
    <label htmlFor={`edit-${field}`}>{definition.label}<span>{definition.min}–{definition.max.toLocaleString()}</span></label>
    <div><input id={`edit-${field}`} type="number" min={definition.min} max={definition.max} step="1" required value={value} onChange={event => setValue(event.target.value)} disabled={busy}/><button disabled={busy}>Save to draft</button></div>
  </form>;
}
