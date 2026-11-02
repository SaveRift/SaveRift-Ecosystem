import {connectPluginUi} from '../../../sdk/ui-bridge.mjs';
import './style.css';

const root = document.querySelector('#root');
const xpForLevel = level => (level - 1) ** 3 * 100;
let client, draft, progression, target = 1;
root.innerHTML = '<p class="eyebrow">SYNTHETIC RPG · CONTRIBUTOR EXTENSION</p><h1>A different kind of adventure.</h1><p class="intro">A custom progression graph, with linked experience and skill points. This example adds a game system without changing the host page.</p><p role="status">Opening the progression workshop…</p>';

function render() {
  const points = progression.skillPoints + (target - progression.level) * 2;
  const graphPoints = Array.from({length: 20}, (_, i) => { const level = 1 + i * 99 / 19; return `${24 + i * 28},${196 - xpForLevel(level) / xpForLevel(100) * 172}`; }).join(' ');
  const markerX = 24 + (target - 1) / 99 * 532, markerY = 196 - xpForLevel(target) / xpForLevel(100) * 172;
  root.innerHTML = `<p class="eyebrow">SYNTHETIC RPG · CONTRIBUTOR EXTENSION</p><h1>Your next chapter.</h1><p class="intro">A custom game system. The connector owns the file format; this separate extension adds the graph and linked progression edit.</p><section class="graph" aria-label="Level and experience curve"><svg role="img" viewBox="0 0 580 225" aria-label="Experience increases with level. Selected level ${target}."><path class="grid" d="M24 24V196H556M24 110H556M290 24V196"/><polyline points="${graphPoints}"/><circle cx="${markerX}" cy="${markerY}" r="7"/><text x="24" y="220">LEVEL 1</text><text x="490" y="220">LEVEL 100</text></svg></section><section class="control"><label for="target">Choose a level <strong id="selected-level">${target}</strong></label><input id="target" type="range" min="1" max="100" value="${target}"/><div class="linked"><article><span>Experience</span><strong>${xpForLevel(target).toLocaleString()}</strong><small>was ${progression.xp.toLocaleString()}</small></article><article><span>Available skill points</span><strong>${points}</strong><small>was ${progression.skillPoints}</small></article></div><p class="note">${points < 0 ? 'This target would remove already spent skill points. Choose a higher level.' : 'Experience and available skill points change together. Unknown records stay with the original save.'}</p><div class="actions"><button id="stage" ${points < 0 ? 'disabled' : ''}>Add to changes</button><button id="review" class="secondary">Review changes${draft.operations.length ? ` (${draft.operations.length})` : ''}</button></div><p class="status" role="status"></p></section><p class="disclosure">Demonstration data · This synthetic game is unrelated to Crimson Desert and never contacts Xbox.</p>`;
  root.querySelector('#target').addEventListener('input', event => { target = Number(event.target.value); render(); root.querySelector('#target').focus(); });
  root.querySelector('#review').addEventListener('click', () => perform(() => client.openReview()));
  root.querySelector('#stage').addEventListener('click', () => perform(async () => { draft = await client.stage({expectedRevision: draft.revision, operation: {id: 'example.level-tools.setLevel', apiVersion: '0.1.0', params: {targetLevel: target}}}); render(); root.querySelector('.status').textContent = 'Queued. Review it in the host before exporting.'; }));
}
async function perform(action) {
  const status = root.querySelector('.status'); status.textContent = 'Working…';
  try { await action(); } catch (error) { root.querySelector('.status').textContent = error.message || 'This change could not be staged.'; }
}
try {
  client = await connectPluginUi();
  [draft, progression] = await Promise.all([client.getDraft(), client.query({method: 'example.level-tools.inspect', args: {}})]);
  progression = progression.progression || progression; target = progression.level;
  client.onDraft(value => { draft = value; render(); });
  await client.subscribeDraft(); render();
} catch (error) { root.querySelector('[role="status"]').textContent = error.message || 'The workshop could not connect.'; }
