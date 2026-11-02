// Public synthetic oversized transport input; never a private player fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {toolDefinition} from '../tool-definitions.mjs';
test('oversized fixture selections fail their collection bound before accumulating element errors',()=>{
 const result=toolDefinition('saverift_tests_run').schema.safeParse({workspaceId:'workspace_synthetic',artifactId:'artifact_synthetic',fixtureIds:Array(10000).fill({invalid:'synthetic'})});
 assert.equal(result.success,false);assert.equal(result.error.issues.length,1);
 assert.equal(result.error.issues[0].code,'too_big');assert.deepEqual(result.error.issues[0].path,['fixtureIds']);
});
