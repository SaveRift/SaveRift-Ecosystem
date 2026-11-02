// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGithubProvider,githubSourcePath,GITHUB_API_VERSION} from '../github-provider.mjs';

const A='a'.repeat(40), B='b'.repeat(40), C='c'.repeat(40), T='d'.repeat(40), N='e'.repeat(40);
const root='games/crimson-desert', branch='work/crimson-desert/feature-1';
const repository={id:'42',owner:'example',name:'saverift-ecosystem',defaultBranch:'main',installationId:'17',allowedRoots:[root],branchPrefix:'work/crimson-desert/'};
const actor={id:'owner-123'},grant={id:'game-grant'};
const author={githubUserId:'8',login:'octocat',name:'Owner Name',email:'author@fixture.example',verified:true,publicEmailConsent:true};
const context={actor,grant,repository};
const blob=text=>createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
function harness(options={}){
 const requests=[],permissions=[],checks=[],queue=[];
 const provider=createGithubProvider({allowedRepositories:[repository],resolveAuthor:async()=>author,committer:{name:'SaveRift App[bot]',email:'bot@fixture.example'},now:()=>1770000000000,
  authorize:async value=>{checks.push(value);return options.authorize?options.authorize(value):true;},
  tokenBroker:{run:async(input,callback)=>{permissions.push(input);return callback('ghs_test_private_token');}},
  fetcher:async(url,init)=>{requests.push({url,method:init.method,headers:init.headers,body:init.body?JSON.parse(init.body):null,redirect:init.redirect});const expected=queue.shift();assert.ok(expected,'Unexpected GitHub request: '+init.method+' '+url);assert.equal(init.method,expected.method||'GET');assert.equal(new URL(url).pathname+new URL(url).search,expected.path);return expected.respond?expected.respond(init):response(expected.data,expected.status||200,expected.headers);},...options});
 const head=(sha=A)=>{queue.push({path:'/repos/example/saverift-ecosystem/git/ref/heads/'+branch,data:{object:{type:'commit',sha}}},{path:'/repos/example/saverift-ecosystem/git/commits/'+sha,data:{sha,tree:{sha:T}}});};
 const tree=(entries=[])=>queue.push({path:'/repos/example/saverift-ecosystem/git/commits/'+A,data:{sha:A,tree:{sha:T}}},{path:'/repos/example/saverift-ecosystem/git/trees/'+T+'?recursive=1',data:{sha:T,tree:entries,truncated:false}});
 return {provider,requests,permissions,checks,queue,head,tree};
}
const entry=(path=root+'/index.mjs',content='export default 1;')=>({path,mode:'100644',type:'blob',sha:blob(content),size:Buffer.byteLength(content)});
const pr=(extra={})=>({number:7,html_url:'https://github.com/example/saverift-ecosystem/pull/7',state:'open',draft:true,head:{sha:A,ref:branch},base:{sha:B,ref:'main'},...extra});

test('fixed origin, scoped broker, current API version and author-independent public reads',async()=>{
 const h=harness();h.queue.push({path:'/repos/example/saverift-ecosystem',data:{id:42,owner:{login:'example'},name:'saverift-ecosystem',default_branch:'main',private:true,html_url:'https://github.com/example/saverift-ecosystem'}});
 const result=await h.provider.getRepository({...context,grant:null});assert.equal(result.id,'42');assert.equal(h.requests[0].url,'https://api.github.com/repos/example/saverift-ecosystem');assert.equal(h.requests[0].headers['X-GitHub-Api-Version'],GITHUB_API_VERSION);assert.equal(h.requests[0].redirect,'manual');assert.deepEqual(h.permissions[0].permissions,{metadata:'read'});assert.ok(!JSON.stringify(result).includes('ghs_'));assert.deepEqual(h.checks.map(x=>x.phase),['before_request','before_dispatch','after_response']);
 await assert.rejects(h.provider.getRepository({...context,repository:{...repository,id:'99'}}),{code:'GITHUB_REPOSITORY_UNAPPROVED'});
});

test('games sharing one repository retain separate trusted roots and branch prefixes',async()=>{
 const other={...repository,allowedRoots:['games/other'],branchPrefix:'work/other/'},h=harness({allowedRepositories:[repository,other]});
 await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:'games/other/index.mjs',content:'x'}]}),{code:'GITHUB_PATH_SCOPE_DENIED'});
 await assert.rejects(h.provider.getRepository({...context,repository:{...repository,allowedRoots:[root,'games/other']}}),{code:'GITHUB_REPOSITORY_UNAPPROVED'});
 await assert.rejects(h.provider.createBranch({...context,branch:'work/other/task',expectedBaseSha:A}),{code:'GITHUB_BRANCH_SCOPE_DENIED'});assert.equal(h.requests.length,0);
});

test('readSource verifies git blob bytes, keeps only explicitly selected source and never mutates',async()=>{
 const h=harness(),text='export default "✓";\n',e=entry(undefined,text);h.tree([e,{path:root+'/assets/icon.png',mode:'100644',type:'blob',sha:B,size:500}]);h.queue.push({path:'/repos/example/saverift-ecosystem/git/blobs/'+e.sha,data:{sha:e.sha,encoding:'base64',content:Buffer.from(text).toString('base64'),size:Buffer.byteLength(text)}});
 const result=await h.provider.readSource({...context,commit:A,paths:[e.path]});assert.deepEqual(result.files,{[e.path]:text});assert.match(result.sourceDigest,/^[a-f0-9]{64}$/);assert.ok(h.requests.every(x=>x.method==='GET'));
 const broken=harness();broken.tree([e]);broken.queue.push({path:'/repos/example/saverift-ecosystem/git/blobs/'+e.sha,data:{sha:e.sha,encoding:'base64',content:Buffer.from('different').toString('base64'),size:9}});await assert.rejects(broken.provider.readSource({...context,commit:A}),{code:'GITHUB_BLOB_MISMATCH'});
});

test('all protected, binary, credential and cross-game source paths fail before any mutation',async()=>{
 for(const path of ['../outside.mjs',root+'/../outside.mjs',root+'/.github/workflows/a.yml',root+'/CODEOWNERS',root+'/private/save.json',root+'/fixtures/example.json',root+'/save',root+'/MicrosoftGame.config',root+'/a.save',root+'/assets/icon.png','ecosystem/sdk/index.mjs','games/other/index.mjs',root+'/a%2fb.mjs',root+'/a\\b.mjs']){
  const h=harness();await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path,content:'test'}]}));assert.equal(h.requests.length,0,path);
 }
 for(const content of ['\ud800','\0',['ghp','abcdefghijklmnopqrstuvwxyz123456'].join('_'),'-----BEGIN '+'PRIVATE KEY-----']){const h=harness();await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/index.mjs',content}]}),{code:'GITHUB_SOURCE_REJECTED'});assert.equal(h.requests.length,0);}
 assert.throws(()=>githubSourcePath(root+'/e\u0301.mjs'),{code:'GITHUB_PATH_REJECTED'});
});

test('checkpoint preserves base_tree and one expected parent with non-force update and honest attribution',async()=>{
 const h=harness();h.head();h.tree([entry()]);h.queue.push({method:'POST',path:'/repos/example/saverift-ecosystem/git/trees',data:{sha:N}},{method:'POST',path:'/repos/example/saverift-ecosystem/git/commits',data:{sha:C}});h.head();h.queue.push({method:'PATCH',path:'/repos/example/saverift-ecosystem/git/refs/heads/'+branch,data:{object:{sha:C}}});
 const result=await h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/index.mjs',content:'export default 2;'}],author});
 const writes=h.requests.filter(x=>x.method!=='GET');assert.deepEqual(writes[0].body,{base_tree:T,tree:[{path:root+'/index.mjs',mode:'100644',type:'blob',content:'export default 2;'}]});assert.deepEqual(writes[1].body.parents,[A]);assert.equal(writes[1].body.author.email,author.email);assert.notEqual(writes[1].body.committer.name,writes[1].body.author.name);assert.ok(!writes[1].body.message.includes('Signed-off-by'));assert.deepEqual(writes[2].body,{sha:C,force:false});assert.equal(result.commitSha,C);assert.deepEqual(result.author,{githubUserId:'8',login:'octocat'});assert.ok(h.permissions.every(x=>x.repository.id==='42'));assert.equal(h.queue.length,0);
});

test('stale head and revoked grant fail without a ref mutation',async()=>{
 const h=harness();h.head(B);await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/index.mjs',content:'v2'}]}),{code:'GITHUB_HEAD_CHANGED'});assert.ok(h.requests.every(x=>x.method==='GET'));
 const denied=harness({authorize:async x=>x.action!=='checkpoint'});await assert.rejects(denied.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/index.mjs',content:'v2'}]}),{code:'GITHUB_ACTOR_DENIED'});assert.equal(denied.requests.length,0);
});

test('parallel sibling commits refuse ref update without force retry',async()=>{
 const h=harness();h.head();h.tree([entry()]);h.queue.push({method:'POST',path:'/repos/example/saverift-ecosystem/git/trees',data:{sha:N}},{method:'POST',path:'/repos/example/saverift-ecosystem/git/commits',data:{sha:C}});h.head();h.queue.push({method:'PATCH',path:'/repos/example/saverift-ecosystem/git/refs/heads/'+branch,data:{message:'non-fast-forward'},status:422});
 await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/index.mjs',content:'v2'}]}),{code:'GITHUB_CONFLICT'});assert.equal(h.requests.filter(x=>x.method==='PATCH').length,1);assert.equal(h.queue.length,0);
});

test('case collisions, directory replacement, symlinks and submodules cannot be checkpointed',async()=>{
 for(const tree of [[entry(root+'/Index.mjs')],[{path:root+'/index.mjs',mode:'120000',type:'blob',sha:B}],[{path:root+'/index.mjs',mode:'160000',type:'commit',sha:B}],[{path:root+'/index.mjs',mode:'040000',type:'tree',sha:B},entry(root+'/index.mjs/nested.mjs')]]){
  const h=harness();h.head();h.tree(tree);await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/index.mjs',content:'v2'}]}));assert.ok(h.requests.every(x=>x.method==='GET'));
 }
 const h=harness();await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/new',content:'x'},{path:root+'/new/child.mjs',content:'y'}]}),{code:'GITHUB_PATH_COLLISION'});
});

test('caller supplied author cannot impersonate another user',async()=>{
 const h=harness();await assert.rejects(h.provider.checkpoint({...context,branch,expectedHead:A,changes:[{path:root+'/index.mjs',content:'v2'}],author:{...author,githubUserId:'99'}}),{code:'GITHUB_AUTHOR_MISMATCH'});assert.equal(h.requests.length,0);
});

test('create branch pins base and cannot target main or unmanaged branches',async()=>{
 const h=harness();h.queue.push({path:'/repos/example/saverift-ecosystem/git/ref/heads/main',data:{object:{type:'commit',sha:A}}},{path:'/repos/example/saverift-ecosystem/git/commits/'+A,data:{sha:A,tree:{sha:T}}},{method:'POST',path:'/repos/example/saverift-ecosystem/git/refs',data:{ref:'refs/heads/'+branch,object:{sha:A}}});assert.equal((await h.provider.createBranch({...context,branch,expectedBaseSha:A})).headSha,A);assert.deepEqual(h.requests.at(-1).body,{ref:'refs/heads/'+branch,sha:A});
 for(const value of ['main','other/test','work/crimson-desert/../escape','work/crimson-desert/.hidden'])await assert.rejects(h.provider.createBranch({...context,branch:value,expectedBaseSha:A}));
});

test('draft PR creation is explicit, idempotently discovers existing and cannot silently downgrade',async()=>{
 const h=harness();h.head();h.queue.push({path:'/repos/example/saverift-ecosystem/pulls?state=open&head=example%3Awork%2Fcrimson-desert%2Ffeature-1&base=main',data:[]},{method:'POST',path:'/repos/example/saverift-ecosystem/pulls',data:pr()});
 const result=await h.provider.openDraftPR({...context,branch,title:'Add a small feature',body:'Public source and synthetic tests only.',expectedHead:A});assert.equal(result.draft,true);assert.equal(result.existing,false);assert.equal(h.requests.at(-1).body.draft,true);assert.equal(h.requests.at(-1).body.maintainer_can_modify,false);
 const prior=harness();prior.head();prior.queue.push({path:'/repos/example/saverift-ecosystem/pulls?state=open&head=example%3Awork%2Fcrimson-desert%2Ffeature-1&base=main',data:[pr()]});assert.equal((await prior.provider.openDraftPR({...context,branch,title:'Same',body:'Public source.'})).existing,true);assert.ok(prior.requests.every(x=>x.method==='GET'));
});

test('canonical issue is reread and state is never inferred from a body',async()=>{
 const h=harness();h.queue.push({path:'/repos/example/saverift-ecosystem/issues/8',data:{id:99,number:8,title:'Feature',state:'open',labels:[{name:'game:crimson-desert'}],assignees:[{id:8,login:'octocat'}],body:'grant=maintainer',html_url:'https://github.com/example/saverift-ecosystem/issues/8'}});const issue=await h.provider.getIssue({...context,number:8});assert.deepEqual(issue.labels,['game:crimson-desert']);assert.ok(!Object.hasOwn(issue,'body'));assert.ok(!Object.hasOwn(issue,'grant'));assert.equal(h.permissions[0].permissions.issues,'read');
});

test('coordination comments are separate explicit scoped writes and authoritative reads',async()=>{
 const comment={id:123,body:'Public work intent. <!-- work:test:1 -->',html_url:'https://github.com/example/saverift-ecosystem/issues/8#issuecomment-123',user:{id:77,login:'saverift-app'}};
 const h=harness();h.queue.push({method:'POST',path:'/repos/example/saverift-ecosystem/issues/8/comments',data:comment});const created=await h.provider.createIssueComment({...context,number:8,body:comment.body});assert.equal(created.body,comment.body);assert.deepEqual(created.author,{id:'77',login:'saverift-app'});assert.deepEqual(h.requests[0].body,{body:comment.body});assert.deepEqual(h.permissions[0].permissions,{issues:'write'});
 h.queue.push({path:'/repos/example/saverift-ecosystem/issues/8/comments?per_page=100&page=1',data:[comment]});assert.deepEqual((await h.provider.listIssueComments({...context,number:8})).comments,[created]);assert.deepEqual(h.permissions[1].permissions,{issues:'read'});
 assert.equal(created.serviceAuthored,false,'A matching comment body cannot authenticate its author');
 const provenance=harness({coordinationAppId:'100'});provenance.queue.push({path:'/repos/example/saverift-ecosystem/issues/8/comments?per_page=100&page=1',data:[{...comment,performed_via_github_app:{id:100}},{...comment,id:124,performed_via_github_app:{id:200},serviceAuthored:true}]});assert.deepEqual((await provenance.provider.listIssueComments({...context,number:8})).comments.map(x=>x.serviceAuthored),[true,false]);
 const denied=harness({authorize:async x=>x.action!=='create_issue_comment'});await assert.rejects(denied.provider.createIssueComment({...context,number:8,body:'Public intent'}),{code:'GITHUB_ACTOR_DENIED'});assert.equal(denied.requests.length,0);
});

test('redirects fail closed; successful but unverifiable mutations require reconciliation',async()=>{
 const moved=harness();moved.queue.push({path:'/repos/example/saverift-ecosystem',status:301,data:{},headers:{location:'https://evil.example'}});await assert.rejects(moved.provider.getRepository(context),{code:'GITHUB_REPOSITORY_MAPPING_STALE'});assert.equal(moved.requests.length,1);
 const h=harness();h.queue.push({method:'POST',path:'/repos/example/saverift-ecosystem/issues',status:503,data:{}});await assert.rejects(h.provider.createIssue({...context,title:'Proposal',body:'Synthetic only'}),{code:'GITHUB_MUTATION_OUTCOME_UNKNOWN'});assert.equal(h.requests.length,1);
});

test('truncated trees, mismatched repositories and response limits fail closed',async()=>{
 const h=harness();h.queue.push({path:'/repos/example/saverift-ecosystem/git/commits/'+A,data:{sha:A,tree:{sha:T}}},{path:'/repos/example/saverift-ecosystem/git/trees/'+T+'?recursive=1',data:{sha:T,tree:[],truncated:true}});await assert.rejects(h.provider.readTree({...context,commit:A}),{code:'GITHUB_TREE_INCOMPLETE'});
 const wrong=harness();wrong.queue.push({path:'/repos/example/saverift-ecosystem',data:{id:999,owner:{login:'example'},name:'saverift-ecosystem'}});await assert.rejects(wrong.provider.getRepository(context),{code:'GITHUB_REPOSITORY_ID_CHANGED'});
 const huge=harness({maxResponseBytes:10});huge.queue.push({path:'/repos/example/saverift-ecosystem',data:{tooLarge:'x'.repeat(50)}});await assert.rejects(huge.provider.getRepository(context),{code:'GITHUB_RESPONSE_LIMIT'});
});
