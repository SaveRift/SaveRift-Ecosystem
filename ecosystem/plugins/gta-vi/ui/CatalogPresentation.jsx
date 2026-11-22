// SPDX-License-Identifier: Apache-2.0
import {useEffect, useState} from 'react';
import {resolveCatalogImage} from './catalog-image.mjs';

const formatValue = value => value === null || value === undefined ? 'Not supplied' :
  typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const factValue = fact => `${formatValue(fact.displayValue ?? fact.value)}${fact.unit ? ` ${fact.unit}` : fact.scaleMax ? ` / ${fact.scaleMax}` : ''}`;

function Preview({client, media, name}) {
  const assetId = media.find(item => typeof item.assetId === 'string' && item.assetId)?.assetId;
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, image;
    setUrl(null); setFailed(false);
    if (assetId) resolveCatalogImage(client, assetId).then(value => {
      if (!active) { value.dispose(); return; }
      image = value; setUrl(value.url);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; image?.dispose(); };
  }, [client, assetId]);
  return <figure className="catalog-preview">
    {url && !failed ? <img src={url} alt={`${name} preview`} onError={() => setFailed(true)}/> :
      <div className="preview-placeholder"><strong>{assetId && !failed ? 'Loading preview…' : failed ? 'Preview unavailable' : 'Preview not yet available'}</strong><span>{media.length ? 'A source image reference is recorded.' : 'No thumbnail has been linked to this entry.'}</span></div>}
  </figure>;
}

export function CatalogPresentation({client, response, pending, error, onSelectRelated}) {
  if (pending) return <p className="muted" role="status">Loading entry details…</p>;
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!response?.available) return <p className="muted presentation-missing">Rich details have not been linked to this catalog entry yet.</p>;
  const details = response.details, name = response.name?.en || response.catalogId;
  const stats = details.stats || [], properties = details.properties || [], media = details.media || [];
  const interpreted = [...stats, ...properties].some(fact => fact.sourceInterpreted);
  return <div className="catalog-presentation">
    <div className="presentation-overview">
      <Preview client={client} media={media} name={name}/>
      <div className="presentation-copy"><p className="eyebrow">CATALOG DETAILS</p>
        {details.description?.en && <p className="presentation-description">{details.description.en}</p>}
        <dl className="presentation-summary"><div><dt>Price</dt><dd>{details.price === null || details.price === undefined ? 'Not available' : formatValue(details.price)}</dd></div>
          {details.publishedIdentifier && <div><dt>Published identifier</dt><dd className="hash">{details.publishedIdentifier}</dd></div>}
          <div><dt>Data source</dt><dd>{response.sources?.find(source => source.id === details.sourceRef)?.title || details.sourceRef || 'Source listed below'}</dd></div>
        </dl><p className="presentation-note">These are published catalog facts. Availability in the selected save has not been established.</p>
      </div>
    </div>
    {stats.length > 0 && <section className="presentation-facts" aria-label="Entry statistics"><h4>Statistics</h4><div className="detail-stat-grid">{stats.map((fact, index) => <div className="detail-stat" key={`${fact.key}:${index}`}><span>{fact.label || fact.key}{fact.sourceInterpreted ? ' *' : ''}</span><strong>{factValue(fact)}</strong></div>)}</div></section>}
    {properties.length > 0 && <section className="presentation-facts" aria-label="Entry properties"><h4>Properties</h4><dl className="detail-properties">{properties.map((fact, index) => <div key={`${fact.key}:${index}`}><dt>{fact.label || fact.key}{fact.sourceInterpreted ? ' *' : ''}</dt><dd>{factValue(fact)}</dd></div>)}</dl></section>}
    {interpreted && <p className="presentation-note">* The source interprets this field's meaning or unit; it has not been independently verified.</p>}
    {!!details.relatedSpecCatalogIds?.length && <section className="presentation-facts"><h4>Related weapon definitions</h4><p className="muted">View the linked specification for its statistics and model references.</p><div className="related-definitions">{details.relatedSpecCatalogIds.map(id => <button type="button" key={id} onClick={() => onSelectRelated(id)}>{id}</button>)}</div></section>}
    {!!details.models?.length && <details className="presentation-evidence"><summary>Model references ({details.models.length})</summary><dl>{details.models.map((model, index) => <div key={`${model.role}:${index}`}><dt>{model.role || 'Model'}</dt><dd><code>{model.value}</code>{model.representation && <span className="reference-kind">{model.representation}</span>}</dd></div>)}</dl></details>}
    <details className="presentation-evidence"><summary>Detail sources and image references</summary><p className="muted">Image references describe the source material. Previews appear when the host supplies a pinned image asset.</p>
      {response.sources?.map(source => <div className="detail-source" key={source.id}><strong>{source.title || source.id}</strong><code>{source.url || source.locator || source.id}</code>{source.revision && <span>Revision: {source.revision}</span>}</div>)}
      {media.map((item, index) => <div className="detail-source" key={`${item.sourceRef}:${index}`}><strong>{item.role || 'Image reference'}</strong><code>{item.thumbnailUrl || item.url || item.assetId || 'No image location supplied'}</code>{item.width && item.height ? <span>{item.width} × {item.height}</span> : null}</div>)}
      <p className="hash">{details.sourceRef}{details.sourceRowPointer ? ` · ${details.sourceRowPointer}` : ''}</p>
    </details>
  </div>;
}
