// SPDX-License-Identifier: Apache-2.0
import {useRef, useState} from 'react';
import {CatalogPresentation} from './CatalogPresentation.jsx';

const title = value => String(value || '').replace(/(^|[-_])([a-z])/g, (_, gap, letter) => `${gap ? ' ' : ''}${letter.toUpperCase()}`);
const readable = entry => entry?.name?.en || entry?.id || 'Unnamed entry';

export function GtaViExplorer({client, summary, initialFields, initialCatalog}) {
  const [view, setView] = useState('save');
  const [fields, setFields] = useState(initialFields);
  const [categories] = useState(initialCatalog.categories || []);
  const [category, setCategory] = useState('characters');
  const [catalogPage, setCatalogPage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [presentation, setPresentation] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const detailRequestId = useRef(0);
  const catalogOffsets = useRef([0]);
  const platform = summary.platform === 'ps5' ? 'PlayStation 5' : 'Xbox Series X|S';

  async function loadFields(offset) {
    const request = ++requestId.current;
    setBusy(true); setError('');
    try {
      const page = await client.query({method: 'gtavi.fields.list', args: {offset, limit: 50}});
      if (request === requestId.current) setFields(page);
    } catch (cause) { if (request === requestId.current) setError(cause.message || 'Fields could not be loaded.'); }
    finally { if (request === requestId.current) setBusy(false); }
  }

  async function loadCategory(nextCategory, offset = 0) {
    const request = ++requestId.current;
    detailRequestId.current++;
    setBusy(true); setError(''); setCategory(nextCategory); setSelected(null); setPresentation(null); setDetailBusy(false); setDetailError('');
    try {
      const page = await client.query({method: 'gtavi.catalog.list', args: {category: nextCategory, offset, limit: 25}});
      if (request === requestId.current) {
        const prior = category === nextCategory ? catalogOffsets.current : [];
        const previousIndex = prior.indexOf(offset);
        catalogOffsets.current = offset === 0 ? [0] : previousIndex >= 0 ? prior.slice(0, previousIndex + 1) : [...prior, offset];
        setCatalogPage(page);
      }
    } catch (cause) { if (request === requestId.current) setError(cause.message || 'The catalog could not be loaded.'); }
    finally { if (request === requestId.current) setBusy(false); }
  }

  async function selectEntry(entryOrId) {
    const entry = typeof entryOrId === 'string' ? {id: entryOrId} : entryOrId;
    const request = ++detailRequestId.current;
    setSelected(entry); setPresentation(null); setDetailBusy(true); setDetailError('');
    try {
      const response = await client.query({method: 'gtavi.catalog.details', args: {catalogId: entry.id}});
      if (request === detailRequestId.current) {
        setPresentation(response);
        setSelected({...entry, name: response.name, applicability: response.applicability, confidence: response.confidence});
      }
    } catch (cause) { if (request === detailRequestId.current) setDetailError(cause.message || 'Entry details could not be loaded.'); }
    finally { if (request === detailRequestId.current) setDetailBusy(false); }
  }

  function switchView(next) {
    setView(next); setError('');
    if (next === 'catalog' && (!catalogPage || catalogPage.category !== category)) void loadCategory(category);
  }

  return <main className="gta-shell">
    <header className="gta-header">
      <div><p className="eyebrow">SAVERIFT · GAME PROJECT</p><h1>Grand Theft Auto VI</h1><p className="subtitle">Explore your selected save and the public game catalog.</p></div>
      <span className={`platform ${summary.platform}`}>{platform}</span>
    </header>
    <div className="read-only" role="status"><strong>Read-only preview</strong><span>SaveRift is inspecting decoded game data. Your original save is unchanged. Editing and sending a save are not available from this connector yet.</span></div>
    <nav className="tabs" aria-label="GTA VI sections">
      <button type="button" className={view === 'save' ? 'active' : ''} aria-current={view === 'save' ? 'page' : undefined} onClick={() => switchView('save')}>Selected save</button>
      <button type="button" className={view === 'catalog' ? 'active' : ''} aria-current={view === 'catalog' ? 'page' : undefined} onClick={() => switchView('catalog')}>Game catalog</button>
    </nav>
    {error && <p className="error" role="alert">{error}</p>}
    {view === 'save' ? <section className="gta-section" aria-label="Selected save inspection">
      <div className="section-heading"><div><p className="eyebrow">01 · SELECTED SAVE</p><h2>Inside your save</h2><p>Decoded JSAV structure from the selected {platform} file.</p></div><span className="quiet-label">Inspection only</span></div>
      <div className="stat-grid">
        <Stat label="Code blocks" value={summary.codeBlockCount}/>
        <Stat label="Script blocks" value={summary.scriptBlockCount}/>
        <Stat label="Labeled fields" value={summary.labeledFieldCount ?? summary.fieldCount}/>
        <Stat label="Format" value={`JSAV v${summary.version}`}/>
      </div>
      {summary.hasLargeIntegers && <p className="precision-note">Large identifiers are shown as exact decimal text so their digits are preserved. They remain read-only.</p>}
      <div className="panel"><div className="panel-title"><h3>Labeled save hashes</h3><span>{fields.total || 0} labeled</span></div><p className="muted">This is a small labeled subset of the save's hashes. Names are candidate labels; a hash appearing in a save does not prove an in-game effect or safe edit.</p>
        <div className="field-list" aria-busy={busy}>{(fields.fields || []).map(field => { const samples = field.sampleCount ?? field.occurrences ?? 0; return <div className="field-row" key={field.hash}><div><strong>{field.label || field.name || 'Unresolved field'}</strong><code>{field.name && field.label && field.name !== field.label ? `${field.name} · ${field.hash}` : field.hash}</code></div><span>{samples} sample{samples === 1 ? '' : 's'}</span></div>; })}{!fields.fields?.length && <p className="empty">No field names were available for this selection.</p>}</div>
        <Pager offset={fields.offset || 0} limit={fields.limit || 50} shown={fields.fields?.length || 0} total={fields.total || 0} busy={busy} onPage={loadFields}/>
      </div>
      <details className="evidence"><summary>Format and validation</summary><dl><div><dt>Platform</dt><dd>{platform}</dd></div><div><dt>Source SHA-256</dt><dd className="hash">{summary.sourceSha256}</dd></div><div><dt>Game acceptance</dt><dd>Not tested by this package</dd></div></dl></details>
    </section> : <section className="gta-section" aria-label="Public game catalog">
      <div className="section-heading"><div><p className="eyebrow">02 · GAME CATALOG</p><h2>Map the whole game</h2><p>Community-maintained definitions with evidence and platform scope.</p></div><span className="quiet-label">Public research</span></div>
      <div className="catalog-grid"><nav className="categories" aria-label="Catalog categories">{categories.map(item => <button type="button" key={item.category} className={category === item.category ? 'active' : ''} aria-current={category === item.category ? 'page' : undefined} onClick={() => loadCategory(item.category)}><span>{title(item.category)}</span><span className="count">{item.count}</span></button>)}</nav>
        <div className="panel catalog-results"><div className="panel-title"><h3>{title(category)}</h3><span>{catalogPage?.category === category ? catalogPage.total : categories.find(item => item.category === category)?.count || 0} entries</span></div>
          <div className="catalog-list" aria-busy={busy}>{catalogPage?.category === category ? catalogPage.entries.map(entry => <button type="button" className={`catalog-entry ${selected?.id === entry.id ? 'selected' : ''}`} key={entry.id} onClick={() => selectEntry(entry)}><strong>{readable(entry)}</strong><span>{entry.confidence} · {entry.id}</span></button>) : <p className="empty">Loading {title(category).toLowerCase()}...</p>}{catalogPage?.category === category && !catalogPage.entries.length && <p className="empty">No sourced entries yet. This category is ready for contributions.</p>}</div>
          {catalogPage?.category === category && <Pager offset={catalogPage.offset} limit={catalogPage.limit} shown={catalogPage.entries.length} total={catalogPage.total} previousOffset={catalogOffsets.current[catalogOffsets.current.length - 2] ?? 0} nextOffset={catalogPage.nextOffset} busy={busy} onPage={offset => loadCategory(category, offset)}/>}
        </div></div>
      {selected && <section className="panel entry-detail" aria-label="Selected catalog entry"><div className="panel-title"><h3>{readable(selected)}</h3><span className="confidence">{selected.confidence}</span></div><p className="entry-id">{selected.id}</p>
        <CatalogPresentation key={selected.id} client={client} response={presentation} pending={detailBusy} error={detailError} onSelectRelated={selectEntry}/>
        <details className="presentation-evidence"><summary>Identifiers and catalog evidence</summary><dl><div><dt>Platforms</dt><dd>{selected.applicability?.platforms?.join(', ') || 'Unknown'}</dd></div><div><dt>Build</dt><dd>{selected.applicability?.build || 'Not established'}</dd></div>{Object.entries(selected.nativeIds || {}).slice(0,12).map(([key,value]) => <div key={`id:${key}`}><dt>{title(key)} ID</dt><dd className="hash">{String(value)}</dd></div>)}{Object.entries(selected.attributes || {}).slice(0,12).map(([key,value]) => <div key={`attr:${key}`}><dt>{title(key)}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}<div><dt>Evidence</dt><dd>{selected.evidence?.map(item => `${item.sourceRef}: ${item.location}`).join('; ') || 'Available in the detail sources above'}</dd></div></dl></details></section>}
      <p className="muted contribution">The public catalog covers the game itself. Save-field mappings have their own evidence and do not imply editability.</p>
    </section>}
  </main>;
}

function Stat({label, value}) { return <div className="stat"><span>{label}</span><strong>{value ?? 'Unknown'}</strong></div>; }

function Pager({offset, limit, shown, total, previousOffset = Math.max(0, offset - limit), nextOffset = offset + shown, busy, onPage}) { return <nav className="pager" aria-label="Result pages"><button type="button" disabled={busy || offset === 0} onClick={() => onPage(previousOffset)}>Previous</button><span>{total ? `${offset + 1}-${offset + shown} of ${total}` : '0 entries'}</span><button type="button" disabled={busy || nextOffset === null || nextOffset >= total} onClick={() => onPage(nextOffset)}>Next</button></nav>; }
