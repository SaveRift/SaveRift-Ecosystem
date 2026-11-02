// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryStore,sha256} from '../storage.mjs';
import {createWorkspaceService} from '../service.mjs';
import {DEFAULT_SCOPES} from '../tool-definitions.mjs';

test('a different HTTP service instance cancels a running job without retaining or exposing late candidate bytes',async()=>{
  const store=createMemoryStore(),actor={id:'cancellation-owner',scopes:[...DEFAULT_SCOPES]},tasks=[];
  let release,entered;
  const ready=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>release=resolve),bytes=new TextEncoder().encode('offline candidate');
  const service=createWorkspaceService({store,schedule:p=>tasks.push(p),executeJob:async()=>{entered();await hold;return {status:'passed',privateArtifacts:[{id:'candidate_private_123',logicalPath:'candidate.json',role:'main',byteLength:bytes.length,sha256:sha256(bytes),bytes}]};}});
  const call=(name,args)=>service.dispatch(actor,'saverift_'+name,args);
  let workspace=(await call('workspace_create',{template:'synthetic-json',name:'Cancel test'})).workspace;
  const build=await call('plugin_build',{workspaceId:workspace.id,expectedRevision:workspace.revision});await Promise.all(tasks.splice(0));
  const artifactId=(await call('job_status',{workspaceId:workspace.id,jobId:build.jobId})).job.result.artifactId;
  workspace=(await call('workspace_status',{workspaceId:workspace.id})).workspace;
  const job=await call('tests_run',{workspaceId:workspace.id,artifactId,fixtureIds:workspace.fixtures.map(f=>f.id)});await ready;
  const otherRequest=createWorkspaceService({store});
  await otherRequest.dispatch(actor,'saverift_job_cancel',{workspaceId:workspace.id,jobId:job.jobId});
  release();await Promise.all(tasks.splice(0));
  assert.equal((await call('job_status',{workspaceId:workspace.id,jobId:job.jobId})).status,'cancelled');
  assert.equal((await store.list('developers/',1000)).filter(row=>row.key.includes('/candidates/')).length,0);
  await assert.rejects(service.downloadCandidate(actor,job.jobId),{code:'VALIDATED_CANDIDATE_REQUIRED'});
});
