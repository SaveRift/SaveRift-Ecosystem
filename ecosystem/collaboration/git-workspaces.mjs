// SPDX-License-Identifier: Apache-2.0
// Source-only transformations. GitHub, private fixtures, and Xbox transport have
// deliberately separate callers and permission checks.
import {accessDigest, accessFail, assertProjectPath, normalizeProjectPath} from './authorization.mjs';

export const SOURCE_LIMITS = Object.freeze({files: 256, bytes: 4 * 1024 * 1024, fileBytes: 1024 * 1024});
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
const own = (value, key) => Object.hasOwn(value, key);
const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const forbiddenSegment = /^(?:\.git(?:hub)?|node_modules|private|fixtures?|backups?|captures?|logs?|consents?|snapshots?|autosaves?|player[-_]?data|user[-_]?data|credentials?|tokens?|sessions?|cookies?|\.env(?:\..*)?)$/i;
const forbiddenExtension = /\.(?:save|sav|dat|bin|parc|har|zip|gz|tgz|bz2|xz|7z|rar|tar|xvd|msixvc2?|msix|appx|exe|dll|so|dylib|wasm|class|pyc|o|a|pdf|docx?|xlsx?|pptx?|png|jpe?g|webp|gif|avif|ico|svg|bmp|tiff?|mp[34]|m4[av]|mov|webm|avi|wav|ogg|flac|woff2?|ttf|otf|eot|pem|key|p12|pfx)$/i;
const credentialMaterial = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}|\bXBL3\.0 x=/i;
function sourceFail(code, message = 'Only bounded, public text source in the authorized package may be edited.', status = 400) { accessFail(code, message, status); }
function sourcePath(path) {
  normalizeProjectPath(path);
  if (path.split('/').some(segment => forbiddenSegment.test(segment)) || forbiddenExtension.test(path) || /(?:^|\/)(?:CODEOWNERS|save(?:game)?(?:\.json)?|lobby(?:\.json)?|MicrosoftGame\.config)$/i.test(path) || /^(?:ecosystem\/(?:sdk|registry)|packages\/(?:sdk|mcp)|registry)(?:\/|$)/i.test(path)) sourceFail('SOURCE_PATH_FORBIDDEN');
  return path;
}
export function assertAllowedSourcePath(project, path) { assertProjectPath(project, path); return sourcePath(path); }
function sourceText(value) {
  if (typeof value !== 'string' || value.length > SOURCE_LIMITS.fileBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || credentialMaterial.test(value)) sourceFail('SOURCE_CONTENT_REJECTED');
  const bytes = encoder.encode(value);
  if (bytes.length > SOURCE_LIMITS.fileBytes || decoder.decode(bytes) !== value) sourceFail('SOURCE_CONTENT_REJECTED');
  return bytes.length;
}
function checkedFiles(files, project) {
  if (!plain(files)) sourceFail('SOURCE_FILES_INVALID');
  const paths = Object.keys(files).sort();
  if (paths.length > SOURCE_LIMITS.files) sourceFail('SOURCE_LIMIT_EXCEEDED');
  const seen = new Set(), result = {}; let bytes = 0;
  for (const path of paths) {
    if (Object.getOwnPropertyDescriptor(files, path)?.get || Object.getOwnPropertyDescriptor(files, path)?.set) sourceFail('SOURCE_FILES_INVALID');
    if (project) assertAllowedSourcePath(project, path); else sourcePath(path);
    const folded = path.toLowerCase();
    if (seen.has(folded) || [...seen].some(other => other.startsWith(folded + '/') || folded.startsWith(other + '/'))) sourceFail('SOURCE_PATH_COLLISION');
    seen.add(folded); bytes += sourceText(files[path]);
    if (bytes > SOURCE_LIMITS.bytes) sourceFail('SOURCE_LIMIT_EXCEEDED');
    // defineProperty also makes reserved JS property names inert own entries.
    Object.defineProperty(result, path, {value: files[path], enumerable: true, writable: true, configurable: true});
  }
  return result;
}
export function validateSourceFiles(files, project) { return checkedFiles(files, project); }
export function sourceDigest(files) { return accessDigest(checkedFiles(files)); }
export function applySourceChanges(files, changes, project) {
  const next = checkedFiles(files, project);
  if (!Array.isArray(changes) || changes.length > SOURCE_LIMITS.files) sourceFail('SOURCE_CHANGES_INVALID');
  const seen = new Set();
  for (const change of changes) {
    if (!plain(change) || !own(change, 'path') || own(change, 'content') === own(change, 'after')) sourceFail('SOURCE_CHANGES_INVALID');
    const path = assertAllowedSourcePath(project, change.path), folded = path.toLowerCase();
    if (seen.has(folded) || Object.keys(next).some(existing => existing.toLowerCase() === folded && existing !== path)) sourceFail('SOURCE_PATH_COLLISION');
    seen.add(folded);
    const content = own(change, 'content') ? change.content : change.after;
    if (content === null) { if (!own(next, path)) sourceFail('SOURCE_DELETE_MISSING'); delete next[path]; }
    else { sourceText(content); Object.defineProperty(next, path, {value: content, enumerable: true, writable: true, configurable: true}); }
  }
  return checkedFiles(next, project);
}
export function diffSourceFiles(baseFiles, files) {
  const base = checkedFiles(baseFiles), next = checkedFiles(files);
  return [...new Set([...Object.keys(base), ...Object.keys(next)])].sort().flatMap(path => {
    const before = own(base, path) ? base[path] : null, after = own(next, path) ? next[path] : null;
    return before === after ? [] : [{path, before, after, beforeDigest: before === null ? null : accessDigest(before), afterDigest: after === null ? null : accessDigest(after)}];
  });
}
export function threeWaySourceMerge(baseFiles, localFiles, remoteFiles) {
  const base = checkedFiles(baseFiles), local = checkedFiles(localFiles), remote = checkedFiles(remoteFiles), files = {}, conflicts = [];
  for (const path of [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])].sort()) {
    const before = own(base, path) ? base[path] : null, ours = own(local, path) ? local[path] : null, theirs = own(remote, path) ? remote[path] : null;
    const content = ours === theirs || theirs === before ? ours : ours === before ? theirs : ours;
    if (ours !== theirs && ours !== before && theirs !== before) conflicts.push({path, base: before, local: ours, remote: theirs});
    if (content !== null) Object.defineProperty(files, path, {value: content, enumerable: true, writable: true, configurable: true});
  }
  return {files: checkedFiles(files), conflicts, changes: diffSourceFiles(remote, files)};
}

const publicFields = ['id', 'gameId', 'revision', 'packageRoots', 'packageId', 'projectDigest', 'issueNumber', 'featureKey', 'branch', 'baseRef', 'baseCommit', 'gitHead', 'treeSha', 'lastSynchronizedCommit', 'dirty', 'evidenceState', 'createdAt', 'updatedAt', 'syncState'];
function pick(value, fields) { const result = {}; if (!plain(value)) return result; for (const key of fields) if (own(value, key) && (value[key] === null || ['string', 'boolean', 'number'].includes(typeof value[key]))) result[key] = value[key]; return result; }
export function publicBranchWorkspace(record) {
  if (!plain(record)) sourceFail('BRANCH_WORKSPACE_INVALID');
  const result = pick(record, publicFields);
  if (plain(record.evidenceState)) {
    const evidence = record.evidenceState, summary = {};
    for (const field of ['state', 'runnerVersion', 'reason']) if (evidence[field] === null || typeof evidence[field] === 'string' && evidence[field].length <= (field === 'reason' ? 1000 : 120) && !credentialMaterial.test(evidence[field])) summary[field] = evidence[field];
    for (const field of ['sourceDigest', 'commitSha', 'treeSha']) if (typeof evidence[field] === 'string' && new RegExp(`^[a-f0-9]{${field === 'sourceDigest' ? 64 : 40}}$`).test(evidence[field])) summary[field] = evidence[field];
    if (plain(evidence.dependencyLockDigests)) {
      summary.dependencyLockDigests = {};
      for (const path of Object.keys(evidence.dependencyLockDigests).sort().slice(0, SOURCE_LIMITS.files)) {
        try { sourcePath(path); } catch { continue; }
        if (/(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|requirements\.lock)$/.test(path) && /^[a-f0-9]{64}$/.test(evidence.dependencyLockDigests[path] || '')) summary.dependencyLockDigests[path] = evidence.dependencyLockDigests[path];
      }
    }
    result.evidenceState = summary;
  }
  if (Array.isArray(record.packageRoots)) result.packageRoots = record.packageRoots.filter(value => typeof value === 'string');
  if (record.repository === null) result.repository = null;
  else if (plain(record.repository)) result.repository = pick(record.repository, ['id', 'owner', 'name', 'provider', 'defaultBranch', 'url']);
  if (record.operation === null) result.operation = null;
  else if (typeof record.operation === 'string') result.operation = record.operation;
  else if (plain(record.operation)) result.operation = pick(record.operation, ['id', 'kind', 'action', 'state', 'status', 'startedAt', 'updatedAt', 'completedAt']);
  if (record.pr === null) result.pr = null;
  else if (plain(record.pr)) result.pr = pick(record.pr, ['id', 'number', 'url', 'htmlUrl', 'state', 'draft', 'headSha', 'baseSha', 'headRef', 'baseRef', 'updatedAt']);
  return result;
}
