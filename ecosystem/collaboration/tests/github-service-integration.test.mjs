// SPDX-License-Identifier: Apache-2.0
// Protocol-level integration: real provider + coordinator; only HTTP is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMemoryStore} from '../../workbench/storage.mjs';
import {createGameAccess} from '../enrollment.mjs';
import {createCollaborationService} from '../service.mjs';
import {createGithubProvider} from '../github-provider.mjs';

const root='ecosystem/plugins/synthetic-game/',repo={id:'71234',owner:'saverift-test',name:'ecosystem',defaultBranch:'main'},repoPath='/repos/saverift-test/ecosystem';
const project={id:'synthetic',displayName:'Synthetic game',packageId:'example.synthetic-game',packageRoots:[root],templateIds:['synthetic-json'],license:'Apache-2.0',repository:repo,enrollmentOpen:true};
const mapping={...repo,installationId:'17',allowedRoots:[root],branchPrefix:'saverift/synthetic/'};
const a={id:'contributor-a',scopes:['developer']},b={id:'contributor-b',scopes:['developer']};
const hash=value=>createHash('sha1').update(JSON.stringify(value)).digest('hex');
const target=workspace=>({gameId:'synthetic',workspaceId:workspace.id,expectedRevision:workspace.revision,expectedGitHead:workspace.gitHead});
function githubHttp(){
 const calls=[],trees=new Map(),commits=new Map(),refs=new Map(),blobs=new Map(),prs=[];
 function blob(content){const sha=createHash('sha1').update('blob '+Buffer.byteLength(content)+'\0').update(content).digest('hex');blobs.set(sha,content);return {mode:'100644',type:'blob',sha,size:Buffer.byteLength(content)};}
 function tree(files){const entries=Object.fromEntries(Object.entries(files).sort());const sha=hash(entries);trees.set(sha,entries);return sha;}
 function commit(treeSha,parents=[],author={name:'Original',email:'original@fixture.example'}){const value={tree:{sha:treeSha},parents:parents.map(sha=>({sha})),author};const sha=hash(value);commits.set(sha,{sha,...value});return sha;}
 const originalFiles={[root+'connector.mjs']:'export const schema = 1;\n',[root+'README.md']:'Public source\n',[root+'fixture.save']:'{"synthetic":true}'};
 const initial=commit(tree(Object.fromEntries(Object.entries(originalFiles).map(([path,content])=>[path,blob(content)]))));refs.set('main',initial);
 const issue={id:201,number:7,title:'Add companion naming',state:'open',labels:[{name:'game:synthetic'}],assignees:[{id:1,login:'known-contributor'}],html_url:'https://github.com/saverift-test/ecosystem/issues/7'};
 const output=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const fetcher=async(url,init)=>{
  assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(init.redirect,'manual');const path=new URL(url).pathname.slice(repoPath.length),method=init.method,body=init.body?JSON.parse(init.body):null;calls.push({path,method,body});
  if(method==='GET'&&path==='')return output({id:71234,owner:{login:repo.owner},name:repo.name,default_branch:'main',private:true,html_url:'https://github.com/saverift-test/ecosystem'});
  if(method==='GET'&&path.startsWith('/git/ref/heads/')){const branch=decodeURIComponent(path.slice('/git/ref/heads/'.length)),sha=refs.get(branch);return sha?output({ref:'refs/heads/'+branch,object:{type:'commit',sha}}):output({},404);}
  if(method==='GET'&&path.startsWith('/git/commits/'))return output(commits.get(path.slice('/git/commits/'.length)));
  if(method==='GET'&&path.startsWith('/git/trees/')){const sha=path.slice('/git/trees/'.length);return output({sha,truncated:false,tree:Object.entries(trees.get(sha)).map(([path,entry])=>({path,...entry}))});}
  if(method==='GET'&&path.startsWith('/git/blobs/')){const sha=path.slice('/git/blobs/'.length),content=blobs.get(sha);return output({sha,encoding:'base64',content:Buffer.from(content).toString('base64'),size:Buffer.byteLength(content)});}
  if(method==='GET'&&path==='/issues')return output([issue]);
  if(method==='GET'&&path==='/issues/7')return output(issue);
  if(method==='GET'&&path==='/pulls'){const query=new URL(url).searchParams,head=query.get('head');return output(head?prs.filter(x=>repo.owner+':'+x.head.ref===head):prs);}
  if(method==='POST'&&path==='/git/refs'){const branch=body.ref.slice('refs/heads/'.length);if(refs.has(branch))return output({},422);refs.set(branch,body.sha);return output({ref:body.ref,object:{type:'commit',sha:body.sha}},201);}
  if(method==='POST'&&path==='/git/trees'){assert.ok(trees.has(body.base_tree));const files={...trees.get(body.base_tree)};for(const change of body.tree){if(change.sha===null)delete files[change.path];else files[change.path]=blob(change.content);}return output({sha:tree(files)},201);}
  if(method==='POST'&&path==='/git/commits')return output({sha:commit(body.tree,body.parents,body.author)},201);
  if(method==='PATCH'&&path.startsWith('/git/refs/heads/')){assert.equal(body.force,false);const branch=decodeURIComponent(path.slice('/git/refs/heads/'.length)),next=commits.get(body.sha);if(next.parents[0].sha!==refs.get(branch))return output({},422);refs.set(branch,body.sha);return output({ref:'refs/heads/'+branch,object:{sha:body.sha}});}
  if(method==='POST'&&path==='/pulls'){assert.equal(body.draft,true);const pr={number:40+prs.length,title:body.title,html_url:'https://github.com/saverift-test/ecosystem/pull/'+(40+prs.length),draft:true,state:'open',head:{ref:body.head,sha:refs.get(body.head)},base:{ref:body.base,sha:refs.get(body.base)}};prs.push(pr);return output(pr,201);}
  assert.fail('Unexpected REST operation '+method+' '+path);
 };
 return {fetcher,calls,refs,trees,commits,blobs,initial};
}

test('real GitHub provider runs discovery, two contributors, isolated branches, reviewed checkpoint and explicit draft PR',async()=>{
 const store=createMemoryStore(),access=createGameAccess({store,projects:[project],now:()=>1793613600000}),http=githubHttp();
 const git=createGithubProvider({allowedRepositories:[mapping],fetcher:http.fetcher,tokenBroker:{run:async(input,callback)=>{assert.equal(input.repository.installationId,'17');return callback('private-test-installation-token');}},
  authorize:async({actor,grant,action})=>{if(grant)await access.assertGrant(actor,grant);else if(!['read_repository','read_head','read_tree','read_source','list_issues','read_issue','list_pull_requests','read_pull_request','read_checks'].includes(action))return false;await access.assertAccess(actor,{gameId:'synthetic',action:'discovery'});return true;},
  resolveAuthor:async actor=>({githubUserId:actor.id===a.id?'11':'22',login:actor.id,name:actor.id,email:actor.id+'@contributors.invalid',verified:true,publicEmailConsent:true}),now:()=>1793613600000});
 const service=createCollaborationService({store,access,git,now:()=>1793613600000,externalMutationsEnabled:true,reviewSource:async input=>({approved:true,sourceDigest:input.sourceDigest,policyDigest:'a'.repeat(64)})});
 for(const actor of [a,b])await access.enroll(actor,{gameId:'synthetic',expectedRevision:0});
 const discoveries=await Promise.all([service.discoverProject(a,{gameId:'synthetic'}),service.discoverProject(b,{gameId:'synthetic'})]);assert.ok(discoveries.every(x=>x.state==='current'));assert.equal(discoveries[0].repository.id,'71234');assert.equal(discoveries[0].issues[0].title,'Add companion naming');
 const work=discovery=>({gameId:'synthetic',discoveryId:discovery.discoveryId,issueNumber:7,featureKey:'companions.rename',expectedRevision:0});
 const claimed=await service.claimWork(a,work(discoveries[0]));const joined=await service.joinWork(b,{...work(discoveries[1]),expectedRevision:claimed.workItem.revision});
 // Joining updates the shared feature revision before either branch is created.
 const wa=(await service.prepareBranchWorkspace(a,{...work(discoveries[0]),expectedRevision:joined.workItem.revision,expectedGitHead:discoveries[0].head.sha})).workspace;
 const wb=(await service.prepareBranchWorkspace(b,{...work(discoveries[1]),expectedRevision:joined.workItem.revision,expectedGitHead:discoveries[1].head.sha})).workspace;
 assert.notEqual(wa.branch,wb.branch);assert.equal(http.refs.get(wb.branch),http.initial);
 const source=await service.readBranchWorkspace(a,{gameId:'synthetic',workspaceId:wa.id});assert.ok(!Object.hasOwn(source.files,root+'fixture.save'));assert.equal(source.files[root+'connector.mjs'],'export const schema = 1;\n');
 const before=http.calls.length,edited=(await service.patchBranchWorkspace(a,{...target(wa),changes:[{path:root+'connector.mjs',content:'export const schema = 2;\n'}]})).workspace;assert.equal(http.calls.length,before,'Autosave must stay private');
 const review=await service.prepareCheckpoint(a,target(edited)),saved=await service.checkpoint(a,{...target(edited),reviewId:review.review.id});assert.notEqual(saved.workspace.gitHead,http.initial);assert.equal(http.refs.get(wb.branch),http.initial);const committed=http.commits.get(saved.workspace.gitHead),savedTree=http.trees.get(committed.tree.sha);assert.equal(committed.author.name,a.id);assert.equal(http.blobs.get(savedTree[root+'fixture.save'].sha),'{"synthetic":true}');
 const prReview=await service.preparePullRequest(a,target(saved.workspace)),opened=await service.openPullRequest(a,{...target(saved.workspace),reviewId:prReview.review.id});assert.equal(opened.pullRequest.draft,true);const pr=http.calls.find(x=>x.method==='POST'&&x.path==='/pulls');assert.equal(pr.body.draft,true);assert.ok(!pr.body.body.includes('fixture.save'));assert.ok(!pr.body.body.includes('export const schema'));assert.equal(http.calls.filter(x=>x.method==='PATCH').length,1);
 assert.equal(typeof service.publishXbox,'undefined');assert.equal(typeof git.merge,'undefined');
});
