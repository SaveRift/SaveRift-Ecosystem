// SPDX-License-Identifier: Apache-2.0
// Diagnostic only: identify a real default-budget serialization/validation failure.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, basename} from 'node:path';
import assert from 'node:assert/strict';
import {createPluginSession, createExecutionLock} from '../ecosystem/sdk/runner.mjs';
import {createSaveBundle, hash} from '../ecosystem/sdk/contracts.mjs';
import {localTemplates} from '../ecosystem/workbench/local-templates.mjs';
import {packageFromSource} from '../ecosystem/workbench/execution.mjs';
const config = JSON.parse(await readFile(process.env.SAVERIFT_AC_FLOW_CONFIG, 'utf8'));
const template = (await localTemplates()).find(t => t.id === 'plugin-saverift.ac-shadows');
const pkg = packageFromSource(template.files), lock = createExecutionLock(pkg), artifacts = new Map();
const inputs = [];
for (const [i, fixture] of config.fixtures.entries()) {
  const bytes = new Uint8Array(await readFile(fixture.path)), id = `input-${i}`;
  artifacts.set(id, bytes);
  inputs.push({id,logicalPath:fixture.name || basename(fixture.path),role:fixture.role || 'main',byteLength:bytes.length,sha256:hash(bytes)});
}
const bundle = createSaveBundle(inputs), receipt = {packageDigest:pkg.packageDigest,executionLockDigest:lock.digest,phases:[]};
let candidate;
for (const phase of ['serialization','validation']) {
  const added = [...artifacts].filter(([id]) => !inputs.some(a => a.id === id)).map(([id,b]) => candidate?.outputs.find(a => a.id === id) || {id,logicalPath:`reports/${id}.json`,role:'validation-report',byteLength:b.length,sha256:hash(b)});
  const selected = phase === 'serialization' ? bundle : createSaveBundle([...inputs,...added]);
  const session = await createPluginSession({package:pkg,executionLock:lock,bundle:selected,artifacts});
  try {
    if (phase === 'serialization') candidate = await session.call('plan',[bundle,{operations:config.operations,operationDigest:'a'.repeat(64)}]);
    else {
      const validation = await session.call('validate',[bundle,candidate]);
      assert.ok(validation.checks.length > 0 && validation.checks.every(c => c.result === 'passed'), 'Candidate validation checks failed.');
    }
    for (const [id,bytes] of session.artifacts()) artifacts.set(id,bytes);
    receipt.phases.push({phase,status:'passed',...session.metrics()});
  } catch (error) {
    receipt.phases.push({phase,status:'failed',code:error.code || 'FAILED',...session.metrics()});
    break;
  } finally {session.close();}
}
await writeFile(resolve(config.outputDirectory,'phase-probe.json'),JSON.stringify(receipt,null,2));
process.stdout.write(JSON.stringify(receipt)+'\n');
