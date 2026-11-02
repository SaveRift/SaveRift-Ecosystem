import {createContext, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {legacyDrafts, publicOperations, isCrimsonUiOperation} from './draft-adapter.mjs';

const Bridge = createContext(null);
/** No URLs or account storage are exposed to the public game interface. */
export function CrimsonBridgeProvider({client, initialDraft, children, compatibilityQueue = null, draftEnabled = true}) {
  const [state, setState] = useState({canonical: initialDraft, phase: initialDraft ? 'saved' : 'loading', error: null});
  const current = useRef(state); current.current = state;
  useEffect(() => {
    if (!draftEnabled) return;
    let active = true;
    const update = canonical => { if (active) setState(previous => ({...previous, canonical, phase: 'saved', error: null})); };
    const stop = client.onDraft?.(update);
    client.getDraft().then(update).catch(error => { if (active) setState(previous => ({...previous, phase: 'error', error: error.message})); });
    client.subscribeDraft?.().catch(() => {});
    return () => { active = false; stop?.(); };
  }, [client, draftEnabled]);
  const service = useMemo(() => ({
    client,
    query: (method, args = {}) => client.query({method, args}),
    openReview: () => client.openReview(),
    replaceIntents(update) {
      const snapshot = current.current;
      if (!snapshot.canonical || snapshot.phase === 'saving' || snapshot.phase === 'loading') return false;
      const before = legacyDrafts(snapshot.canonical), next = typeof update === 'function' ? update(before) : update;
      const operations = publicOperations(next), removeInstanceIds = snapshot.canonical.operations.filter(isCrimsonUiOperation).map(operation => operation.instanceId);
      current.current = {...snapshot, phase: 'saving', error: null};
      setState(previous => ({...previous, phase: 'saving', error: null}));
      // A complete pack replacement is one host CAS operation, never partial staging.
      client.stage({expectedRevision: snapshot.canonical.revision, operations, removeInstanceIds}).then(canonical => setState({canonical, phase: 'saved', error: null})).catch(error => setState(previous => ({...previous, phase: 'error', error: error.message || 'Your changes could not be saved. Reload the current draft before retrying.'})));
      return true;
    },
  }), [client]);
  const drafts = legacyDrafts(state.canonical);
  const queue = compatibilityQueue || {drafts, phase: state.phase, error: state.error, conflict: null, blockedReason: state.phase === 'loading' ? 'Opening your saved changes…' : state.phase === 'error' ? state.error : state.phase === 'saving' ? 'Saving your changes…' : null, setDrafts: service.replaceIntents, clear: () => service.replaceIntents([]), retry: () => client.getDraft().then(canonical => setState({canonical, phase: 'saved', error: null})), reviewLatest: () => {}, useSaved: () => {}, keepCurrent: () => {}};
  return <Bridge.Provider value={{...service, queue}}>{children}</Bridge.Provider>;
}
export function useCrimsonServices() { const value = useContext(Bridge); if (!value) throw Error('Open this game interface through the public plugin bridge.'); return value; }
export function useCrimsonDraft() { return useCrimsonServices().queue; }
