// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameAccess} from '../enrollment.mjs';
import {createCollaborationService} from '../service.mjs';
import {createMemoryStore} from '../../workbench/storage.mjs';

test('a reviewed source branch is distinct from the real repository default branch',async()=>{
  const store=createMemoryStore(),actor={id:'source-reviewer',scopes:['developer:docs']},sha='2'.repeat(40),treeSha='3'.repeat(40);
  const repository={id:'147',owner:'example',name:'ecosystem',defaultBranch:'main'};
  const project={id:'example',displayName:'Example',packageId:'example.game',packageRoots:['ecosystem/plugins/example/'],templateIds:['example'],license:'Apache-2.0',repository,baseRef:'bootstrap/reviewed',baseCommit:sha,maintainers:['maintainer']};
  const access=createGameAccess({store,projects:[project]}),reads=[];
  const git={getRepository:async()=>repository,readHead:async input=>{reads.push(input.branch);return {sha,treeSha};},listIssues:async()=>({issues:[],hasMore:false}),listDraftPRs:async()=>({pullRequests:[],hasMore:false})};
  const service=createCollaborationService({store,access,git});
  const result=await service.discoverProject(actor,{gameId:'example'});
  assert.equal(result.state,'current');assert.equal(result.head.sha,sha);assert.equal(result.project.repository.defaultBranch,'main');assert.equal(result.project.baseRef,'bootstrap/reviewed');assert.equal(result.project.baseCommit,sha);assert.deepEqual(reads,['bootstrap/reviewed']);
  await assert.rejects(async()=>createGameAccess({store,projects:[{...project,baseRef:'../another-repository'}]}),{code:'PROJECT_CONFIGURATION_INVALID'});
});
