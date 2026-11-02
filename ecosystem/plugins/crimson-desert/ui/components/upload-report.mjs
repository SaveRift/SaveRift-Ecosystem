export const UPLOAD_UI_LIMITS = Object.freeze({maxFiles: 2, maxTotalBytes: 4 * 1024 * 1024});
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safeName = name => typeof name === 'string' && name.length > 0 && name.length <= 180 && !/[\u0000-\u001f\u007f/\\]/.test(name) && !/^\.+$/.test(name);
const artifactId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(value) && !value.includes('://') && !value.split('/').some(part => part === '..');
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export const uploadFileName = file => file.logicalPath.split('/').at(-1).normalize('NFC');
export const nativeChecksPassed = checks => checks?.integrity === true && checks?.structure === true && checks?.roundTrip === true && checks?.plaintextUnchanged === true;
export const uploadSizeLabel = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
export function checkedFileSelection(selection) {
  if (!selection || selection.schema !== 'saverift.file-import.v1' || selection.source !== 'user_upload' || selection.retained !== false || !artifactId(selection.importId) || !Array.isArray(selection.files) || selection.files.length < 1 || selection.files.length > UPLOAD_UI_LIMITS.maxFiles) return false;
  const ids = new Set(), names = new Set(); let total = 0;
  for (const file of selection.files) {
    if (!exact(file, ['id', 'logicalPath', 'byteLength', 'sha256']) || !artifactId(file.id) || typeof file.logicalPath !== 'string' || file.logicalPath.startsWith('/') || file.logicalPath.includes('\\') || file.logicalPath.split('/').some(part => !part || part === '..' || part === '.') || !safeName(uploadFileName(file)) || /\.(?:zip|7z|rar|tar|gz)$/i.test(uploadFileName(file)) || !Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 || !digest(file.sha256) || ids.has(file.id) || names.has(uploadFileName(file).toLowerCase())) return false;
    ids.add(file.id); names.add(uploadFileName(file).toLowerCase()); total += file.byteLength;
  }
  return total <= UPLOAD_UI_LIMITS.maxTotalBytes;
}
export function checkedUploadReport(report, files) {
  if (report?.schema !== 'saverift.uploaded-save-report.v1' || report.source !== 'user_upload' || report.game !== 'crimson-desert' || report.nativeCopyDelivery !== 'binary_artifact' || report.originalsUnchanged !== true || report.stored !== false || report.cloudRequests !== 0 || report.xboxMutations !== 0 || report.xboxTransfer?.canSend !== false || report.xboxTransfer?.state !== 'not_verified' || !Array.isArray(report.files) || report.files.length !== files.length || typeof report.pair?.message !== 'string' || report.pair.message.length > 1200 || typeof report.xboxTransfer.message !== 'string' || report.xboxTransfer.message.length > 1200) return false;
  return report.files.every((file, index) => {
    const original = files[index];
    if (!file || file.name !== uploadFileName(original) || file.bytes !== original.byteLength || file.sha256 !== original.sha256 || !['validated', 'unsupported', 'invalid'].includes(file.status) || !['save', 'lobby', 'unknown'].includes(file.role) || typeof file.summary !== 'string' || file.summary.length > 1200 || typeof file.format !== 'string' || file.format.length > 120) return false;
    const copy = file.nativeCopy;
    if (!copy) return true;
    const artifact = copy.artifact;
    return exact(copy, ['filename', 'bytes', 'sha256', 'artifact']) && file.status === 'validated' && nativeChecksPassed(file.checks) && safeName(copy.filename) && Number.isSafeInteger(copy.bytes) && copy.bytes > 0 && copy.bytes <= UPLOAD_UI_LIMITS.maxTotalBytes && digest(copy.sha256) && artifact && artifactId(artifact.id) && typeof artifact.logicalPath === 'string' && artifact.logicalPath.startsWith('exports/') && artifact.logicalPath.split('/').every(part => part && part !== '.' && part !== '..') && !artifact.logicalPath.includes('\\') && artifact.role === 'native-export' && artifact.byteLength === copy.bytes && artifact.sha256 === copy.sha256 && !Object.hasOwn(artifact, 'dataBase64') && !Object.hasOwn(artifact, 'url');
  });
}
