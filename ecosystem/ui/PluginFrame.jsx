import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {bindPluginFrame} from '../sdk/ui-bridge.mjs';
import {createFrameDocument, PLUGIN_FRAME_PERMISSIONS, PLUGIN_FRAME_SANDBOX} from './frame-document.mjs';
import './plugin-frame.css';

/** Trusted chrome surrounds the isolated view. Handlers are bound to one selection. */
export function PluginFrame({compiledUi, packageIdentity, handlers, bindingKey, draft, onOpenReview, onFault, onSessionClose}) {
  const frame = useRef(null), session = useRef(null), onFaultRef = useRef(onFault), handlersRef = useRef(handlers), openReviewRef = useRef(onOpenReview), sessionCloseRef = useRef(onSessionClose);
  const [state, setState] = useState({document: '', phase: 'loading', instanceId: ''});
  onFaultRef.current = onFault; handlersRef.current = handlers; openReviewRef.current = onOpenReview; sessionCloseRef.current = onSessionClose;
  useEffect(() => {
    let active = true;
    const instanceId = crypto.randomUUID();
    setState({document: '', phase: 'loading', instanceId});
    createFrameDocument({...compiledUi, hostOrigin: location.origin, instanceId, title: packageIdentity.displayName || 'Game save editor'}).then(document => {
      if (active) setState({document, phase: 'connecting', instanceId});
    }).catch(error => { if (active) { setState({document: '', phase: 'failed', instanceId}); onFaultRef.current?.(error); } });
    return () => { active = false; session.current?.revoke('UI_SELECTION_CHANGED'); session.current = null; };
  }, [compiledUi, packageIdentity.id, packageIdentity.version, packageIdentity.digest, bindingKey]);
  useLayoutEffect(() => {
    if (!state.document || !frame.current) return;
    const scopedHandlers = Object.fromEntries(Object.keys(handlersRef.current || {}).map(method => [method, (params, context) => handlersRef.current[method](params, context)]));
    scopedHandlers.openReview = async () => { await openReviewRef.current?.(); return {opened: true}; };
    const bound = bindPluginFrame({frameWindow: frame.current.contentWindow, instanceId: state.instanceId, handlers: scopedHandlers, onClose: reason => sessionCloseRef.current?.(reason), onViolation: error => { setState(previous => ({...previous, phase: 'failed'})); onFaultRef.current?.(error); }, onReady: () => setState(previous => ({...previous, phase: 'ready'}))});
    session.current = bound;
    const timer = setTimeout(() => { if (!bound.connected) { bound.revoke('UI_HANDSHAKE_TIMEOUT'); setState(previous => ({...previous, phase: 'failed'})); } }, 30000);
    return () => { clearTimeout(timer); bound.revoke('UI_UNMOUNTED'); if (session.current === bound) session.current = null; };
  }, [state.document, state.instanceId]);
  useEffect(() => { if (draft && session.current?.connected) session.current.host.notifyDraft(draft); }, [draft, state.phase]);
  function loaded() {
    // Any subsequent document load destroys the originally approved code binding.
    const count = Number(frame.current?.dataset.loads || 0) + 1;
    if (frame.current) frame.current.dataset.loads = String(count);
    if (count > 1) { session.current?.revoke('UI_NAVIGATED'); setState(previous => ({...previous, phase: 'failed'})); }
  }
  return <section className="plugin-frame-shell" aria-label="Game editor">
    <header className="plugin-frame-trust"><span>{packageIdentity.displayName} <small>by {packageIdentity.author || 'Plugin author'}</small></span><span>Isolated game editor · {packageIdentity.version}</span></header>
    {state.phase === 'failed' ? <div className="plugin-frame-fault" role="alert">This game editor stopped. Your original save and saved changes remain available.</div> : null}
    {state.phase === 'loading' || state.phase === 'connecting' ? <p className="plugin-frame-loading" role="status">Opening your game editor…</p> : null}
    {state.document ? <iframe key={state.instanceId} ref={frame} title={`${packageIdentity.displayName} custom editor`} sandbox={PLUGIN_FRAME_SANDBOX} allow={PLUGIN_FRAME_PERMISSIONS} referrerPolicy="no-referrer" credentialless="" srcDoc={state.document} onLoad={loaded} className={state.phase === 'failed' ? 'plugin-frame-hidden' : ''}/> : null}
  </section>;
}
