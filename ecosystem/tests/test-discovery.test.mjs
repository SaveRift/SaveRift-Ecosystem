// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {findPublicTests} from '../scripts/test.mjs';
test('aggregate discovers public test directories without executing private workspace or runtime fixtures',async t=>{
 const root=await mkdtemp(join(tmpdir(),'saverift-test-discovery-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const file of ['sdk/test/runner.test.mjs','sdk/tests/contracts.test.mjs','plugins/example/tests/codec.test.mjs','tests/ui.test.mjs','workbench/.saverift-workbench/source/test/evil.test.mjs','.runtime/evil.test.mjs','plugins/example/runtime/evil.test.mjs']){await mkdir(join(root,file,'..'),{recursive:true});await writeFile(join(root,file),'throw Error("This discovery fixture must never run.");');}
 assert.deepEqual((await findPublicTests(root)).map(path=>path.replaceAll('\\','/')),['plugins/example/tests/codec.test.mjs','sdk/test/runner.test.mjs','sdk/tests/contracts.test.mjs','tests/ui.test.mjs']);
});
