import {useEffect, useId, useRef, useState} from 'react';
import {CheckCircle, DownloadSimple, File, LockSimple, SpinnerGap, UploadSimple, WarningCircle, X} from '@phosphor-icons/react';
import {useCrimsonServices} from './bridge.jsx';
import {UPLOAD_UI_LIMITS, checkedFileSelection, checkedUploadReport, nativeChecksPassed, uploadFileName, uploadSizeLabel} from './upload-report.mjs';
import './save-upload.css';

const labels = {'crimson-save': 'Crimson Desert save', 'zip-archive': 'Archive', 'decoded-parc': 'Decoded save data', unrecognized: 'Unknown format'};
const unavailable = error => ['UI_METHOD_UNAVAILABLE', 'UI_FILE_IMPORT_UNAVAILABLE', 'UI_DOWNLOAD_UNAVAILABLE', 'HOST_ACTION_UNAVAILABLE'].includes(error?.code);

/** Public game-specific intake/results. File dialogs and downloads belong to the host. */
export function SaveUpload({game, onClose, advanced = false, contextKey = '', inline = true}) {
  const {client} = useCrimsonServices(), id = useId();
  const [selection, setSelection] = useState(null), [report, setReport] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [downloading, setDownloading] = useState(null);
  const mounted = useRef(false), epoch = useRef(0), inFlight = useRef(null), busyRef = useRef(false), closeButton = useRef(null);
  const gameKey = `${game?.titleId || 'crimson-desert'}:${game?.key || ''}:${contextKey}`, context = useRef(gameKey); context.current = gameKey;
  const supported = game?.titleId == null || String(game.titleId) === '1754076455';
  useEffect(() => { mounted.current = true; const previous = document.activeElement; closeButton.current?.focus(); return () => { mounted.current = false; epoch.current++; inFlight.current?.abort(); previous?.isConnected && previous.focus(); }; }, []);
  useEffect(() => { epoch.current++; inFlight.current?.abort(); inFlight.current = null; busyRef.current = false; setSelection(null); setReport(null); setError(''); setBusy(false); setDownloading(null); }, [gameKey, advanced]);
  const current = (version, key) => mounted.current && epoch.current === version && context.current === key;
  function reset() { epoch.current++; inFlight.current?.abort(); inFlight.current = null; busyRef.current = false; setSelection(null); setReport(null); setError(''); setBusy(false); setDownloading(null); onClose?.(); }
  async function choose() {
    if (!advanced || !supported || busyRef.current) return;
    const version = ++epoch.current, key = gameKey, controller = new AbortController(); inFlight.current?.abort(); inFlight.current = controller;
    busyRef.current = true; setBusy(true); setError(''); setReport(null); setSelection(null);
    try {
      const selected = await client.requestFileImport({purpose: 'native-save-inspection', maxFiles: UPLOAD_UI_LIMITS.maxFiles, maxTotalBytes: UPLOAD_UI_LIMITS.maxTotalBytes}, {signal: controller.signal});
      if (!current(version, key) || selected === null) return;
      if (!checkedFileSelection(selected)) throw Error('Choose one or two original files totaling no more than 4 MB. Extract archives first.');
      setSelection(selected);
    } catch (cause) { if (current(version, key)) setError(unavailable(cause) ? 'File selection is unavailable in this preview. Your Xbox saves are unchanged.' : cause.message || 'These files could not be selected.'); }
    finally { if (current(version, key)) { busyRef.current = false; setBusy(false); } }
  }
  async function inspect() {
    if (!advanced || !selection || busyRef.current) return;
    const version = ++epoch.current, key = gameKey, controller = new AbortController(); inFlight.current?.abort(); inFlight.current = controller;
    busyRef.current = true; setBusy(true); setError(''); setReport(null);
    try {
      const result = await client.query({method: 'crimson.import.inspect', args: {importId: selection.importId, artifactIds: selection.files.map(file => file.id)}}, {signal: controller.signal});
      if (!current(version, key)) return;
      if (!checkedUploadReport(result, selection.files)) throw Error('The save check did not match your selected files. Choose them again.');
      setReport(result);
    } catch (cause) { if (current(version, key)) setError(cause.message || 'These files could not be checked.'); }
    finally { if (current(version, key)) { busyRef.current = false; setBusy(false); } }
  }
  async function download(file, index) {
    if (!advanced || downloading !== null || !nativeChecksPassed(file.checks) || !file.nativeCopy) return;
    const version = epoch.current, key = gameKey, controller = new AbortController(), copy = file.nativeCopy; inFlight.current = controller; setDownloading(index); setError('');
    try {
      const result = await client.requestDownload({artifactId: copy.artifact.id, filename: copy.filename, expectedSha256: copy.sha256, expectedByteLength: copy.bytes, purpose: 'native-format-copy'}, {signal: controller.signal});
      if (!current(version, key)) return;
      if (result.state === 'unavailable') throw Object.assign(Error('Download unavailable'), {code: 'UI_DOWNLOAD_UNAVAILABLE'});
    } catch (cause) { if (current(version, key)) setError(unavailable(cause) ? 'Downloads are unavailable in this preview. The original files remain unchanged.' : cause.message || 'The checked copy could not be downloaded.'); }
    finally { if (current(version, key)) setDownloading(null); }
  }
  if (!advanced) return <p className="save-upload-notice" role="status">Enable Advanced to check a file from your computer.</p>;
  const files = selection?.files || [];
  return <div className={inline ? 'save-upload-inline' : 'save-upload-scrim'}><section className="save-upload-dialog" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-intro`}>
    <header><div><span className="eyebrow">UPLOAD A SAVE · CRIMSON DESERT</span><h2 id={`${id}-heading`}>Bring your save along.</h2></div><button ref={closeButton} type="button" className="icon-button" aria-label="Close save upload" onClick={reset}><X size={21}/></button></header>
    <p id={`${id}-intro`}>Choose your original PC save file and, if available, its companion lobby file. We’ll identify the format and prepare a checked native-format copy where supported.</p>
    <span className="save-upload-source"><UploadSimple size={14}/>Uploaded files · Separate from your Xbox saves</span>
    {supported ? <><button type="button" className={`save-upload-choose${busy ? ' is-busy' : ''}`} disabled={busy} onClick={choose}><UploadSimple size={27}/><strong>Choose save files</strong><span>One or two files · 4 MB total · No archives</span></button>
      {files.length ? <ul className="save-upload-selection" aria-label="Selected files">{files.map(file => <li key={file.id}><File size={19}/><span><strong>{uploadFileName(file)}</strong><small>{uploadSizeLabel(file.byteLength)}</small></span></li>)}</ul> : null}
      <div className="save-upload-action"><button type="button" className="button primary" disabled={busy || !files.length} onClick={inspect}>{busy ? <SpinnerGap className="save-upload-spinner" size={18}/> : <CheckCircle size={18}/>} {busy ? 'Checking your files…' : 'Check & prepare'}</button><span>Your original files stay unchanged.</span></div>
      {busy ? <p className="save-upload-progress" role="status">Checking file integrity, save structure and reopened output…</p> : null}</> : <p className="save-upload-notice">File preparation currently supports Crimson Desert. More game formats are coming later.</p>}
    {error ? <p className="save-upload-error" role="alert">{error}</p> : null}
    <SaveUploadResults report={report} downloading={downloading} onDownload={download}/>
    <footer><p>Processed privately for this check. This tool does not retain uploaded files.</p><button type="button" className="button secondary" onClick={reset}>Done</button></footer>
  </section></div>;
}

export function SaveUploadResults({report,downloading=null,onDownload=()=>{}}){
  return report ? <section className="save-upload-results" aria-label="Uploaded save results"><h3>Your files, checked.</h3>{report.files.map((file, index) => <article key={`${file.name}:${file.sha256}`} className={`save-upload-result ${file.status}`}><div className="save-upload-result-heading">{file.status === 'validated' ? <CheckCircle size={21}/> : file.status === 'invalid' ? <WarningCircle size={21}/> : <File size={21}/>}<div><strong>{file.name}</strong><span>{labels[file.format] || file.format} · {uploadSizeLabel(file.bytes)}{file.role !== 'unknown' ? ` · ${file.role === 'lobby' ? 'Lobby companion' : 'Main save'}` : ''}</span></div><span className="save-upload-status">{file.status === 'validated' ? 'Checked' : file.status === 'invalid' ? 'Could not validate' : 'Not supported'}</span></div><p>{file.summary}</p>{file.status === 'validated' && nativeChecksPassed(file.checks) ? <div className="save-upload-checks"><span>Integrity checked</span><span>Native copy reopened</span><span>Content unchanged</span></div> : null}{file.nativeCopy ? <button type="button" className="button secondary" disabled={downloading !== null} onClick={() => onDownload(file, index)}><DownloadSimple size={16}/>{downloading === index ? 'Verifying download…' : 'Download native copy'}</button> : null}<details><summary>File checks</summary><pre>{JSON.stringify({sha256: file.sha256, checks: file.checks, nativeCopy: file.nativeCopy ? {bytes: file.nativeCopy.bytes, sha256: file.nativeCopy.sha256} : null}, null, 2)}</pre></details></article>)}<p className="save-upload-pair">{report.pair.message}</p><div className="save-upload-notice"><LockSimple size={18}/><p>{report.xboxTransfer.message} No Xbox save was sent or replaced.</p></div></section> : null;
}
