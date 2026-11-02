// SPDX-License-Identifier: Apache-2.0
// Local-only adapter. Object names are hashed; tool paths never become OS paths.
import {mkdir, readFile, writeFile, rename, unlink, readdir, open, chmod} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {sha256, fail} from './storage.mjs';

export async function createDirectoryStore(directory) {
  const root = resolve(directory);
  await mkdir(root, {recursive: true, mode: 0o700});
  await chmod(root, 0o700);
  const path = key => join(root, `${sha256(key)}.json`);
  const read = async key => {
    try { const row = JSON.parse(await readFile(path(key), 'utf8')); if (row.key !== key) fail('PRIVATE_OBJECT_INVALID', 'Local workspace record is invalid.', 409); return {etag: row.etag, value: row.value}; }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  };
  return {
    get: read,
    async put(key, value, options = {}) {
      const lockPath = `${path(key)}.lock`; let lock;
      try { lock = await open(lockPath, 'wx', 0o600); }
      catch (e) { if (e.code === 'EEXIST') fail('REVISION_CONFLICT', 'A local workspace update is already running. Retry after it completes.', 409); throw e; }
      const tmp = `${path(key)}.${randomUUID()}.tmp`;
      try {
        const prior = await read(key);
        if (options.ifAbsent && prior || options.ifMatch !== undefined && prior?.etag !== options.ifMatch) fail('REVISION_CONFLICT', 'This workspace changed. Refresh before retrying.', 409);
        const row = {key, value, etag: randomUUID()};
        await writeFile(tmp, JSON.stringify(row), {mode: 0o600, flag: 'wx'});
        // Windows readers/scanners can briefly hold the destination open.
        // Keep the same exclusive CAS lock and atomic replacement throughout.
        for(let attempt=0;;attempt++){
          try{await rename(tmp,path(key));break;}
          catch(error){
            if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=4)throw error;
            await delay(10*2**attempt);
          }
        }
        return {etag: row.etag, value: structuredClone(value)};
      } finally { await unlink(tmp).catch(() => {}); await lock.close(); await unlink(lockPath); }
    },
    async delete(key, options = {}) { return this.put(key, {deleted: true}, options); },
    async list(prefix, limit = 100) {
      const names = (await readdir(root)).filter(p => /^[a-f0-9]{64}\.json$/.test(p));
      const rows = [];
      for (const name of names) {
        const row = JSON.parse(await readFile(join(root, name), 'utf8'));
        if (row.key.startsWith(prefix) && !row.value?.deleted) rows.push(row);
        if (rows.length === limit) break;
      }
      return rows;
    }
  };
}
