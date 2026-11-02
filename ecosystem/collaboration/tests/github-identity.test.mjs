// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,verify} from 'node:crypto';
import {createGithubTokenBroker,createGithubIdentityService} from '../github-identity.mjs';
import {createMemoryStore} from '../../workbench/storage.mjs';
import {GITHUB_API_VERSION} from '../github-provider.mjs';

const NOW=1770000000000,origin='https://developer.example.test',callback=origin+'/github/callback',actor={id:'actor-one'},other={id:'actor-two'};
const repository={id:'42',installationId:'17',owner:'example',name:'ecosystem'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const user={id:8,login:'octocat',name:'Owner Name'};
const tokens={access_token:['ghu','private_user_token_for_test'].join('_'),refresh_token:['ghr','private_refresh_for_test'].join('_'),expires_in:28800,refresh_token_expires_in:15897600};
function identityHarness(options={}){
 const store=options.store||createMemoryStore(),calls=[],queue=[];let now=NOW,random=0;
 const identity=createGithubIdentityService({store,clientId:'Iv1.test',clientSecret:'backend_secret',callbackUrl:callback,allowedOrigins:[origin],now:()=>now,random:length=>Buffer.alloc(length,++random),authorize:async()=>true,fetcher:async(url,init)=>{calls.push({url,init});const next=queue.shift();assert.ok(next,'Unexpected identity request: '+url);assert.equal(url,next.url);return next.respond?next.respond(init):json(next.data,next.status);},...options});
 const oauth=()=>queue.push({url:'https://github.com/login/oauth/access_token',data:tokens},{url:'https://api.github.com/user',data:user});
 async function link(){const begin=await identity.begin({actor,origin}),state=new URL(begin.authorizationUrl).searchParams.get('state');oauth();const result=await identity.complete({actor,state,code:'code-one',url:callback+'?code=code-one&state='+state});return {begin,state,result};}
 return {store,calls,queue,identity,oauth,link,advance:value=>{now+=value;}};
}

test('OAuth begins at genuine GitHub with random state, S256 and offline_access only',async()=>{
 const h=identityHarness(),result=await h.identity.begin({actor,origin}),url=new URL(result.authorizationUrl);assert.equal(url.origin,'https://github.com');assert.equal(url.pathname,'/login/oauth/authorize');assert.equal(url.searchParams.get('scope'),'offline_access');assert.equal(url.searchParams.get('redirect_uri'),callback);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.match(url.searchParams.get('code_challenge'),/^[A-Za-z0-9_-]{43}$/);assert.ok(!JSON.stringify(result).includes('verifier'));assert.ok(!JSON.stringify(result).includes('backend_secret'));
 const records=await h.store.list('github/states/');const verifier=records[0].value.verifier;assert.equal(createHash('sha256').update(verifier).digest('base64url'),url.searchParams.get('code_challenge'));assert.equal(h.calls.length,0);
});

test('callback validates state against actor, URL and one-time CAS before any token request',async()=>{
 const h=identityHarness(),begin=await h.identity.begin({actor,origin}),state=new URL(begin.authorizationUrl).searchParams.get('state'),valid={actor,state,code:'code',url:callback+'?code=code&state='+state};
 await assert.rejects(h.identity.complete({...valid,actor:other}),{code:'GITHUB_OAUTH_STATE_REJECTED'});
 for(const url of ['https://evil.test/github/callback?code=code&state='+state,callback+'?code=other&state='+state,callback+'?code=code&code=code&state='+state,'https://somebody@developer.example.test/github/callback?code=code&state='+state])await assert.rejects(h.identity.complete({...valid,url}),{code:'GITHUB_CALLBACK_REJECTED'});
 assert.equal(h.calls.length,0);h.oauth();assert.equal((await h.identity.complete(valid)).githubUserId,'8');await assert.rejects(h.identity.complete(valid),{code:'GITHUB_OAUTH_STATE_REJECTED'});assert.equal(h.calls.length,2);
 const body=new URLSearchParams(h.calls[0].init.body);assert.equal(body.get('client_secret'),'backend_secret');assert.ok(body.get('code_verifier'));assert.equal(h.calls[0].init.redirect,'manual');
});

test('expired state and begin rate limit stop before issuing more authorization traffic',async()=>{
 const h=identityHarness(),begin=await h.identity.begin({actor,origin}),state=new URL(begin.authorizationUrl).searchParams.get('state');h.advance(600001);await assert.rejects(h.identity.complete({actor,state,code:'old',url:callback+'?code=old&state='+state}),{code:'GITHUB_OAUTH_STATE_REJECTED'});
 for(let i=0;i<5;i++)await h.identity.begin({actor,origin});await assert.rejects(h.identity.begin({actor,origin}),{code:'GITHUB_IDENTITY_RATE_LIMIT'});assert.equal(h.calls.length,0);
});

test('identity status and completion contain no credentials, grant or repository installation authority',async()=>{
 const h=identityHarness(),{result}=await h.link(),status=await h.identity.status({actor});assert.equal(result.linked,true);assert.equal(status.commitIdentityReady,false);assert.deepEqual(status,result);for(const forbidden of ['access_token','refresh_token','backend_secret','ghu_','ghr_','installationId','grant'])assert.ok(!JSON.stringify(status).includes(forbidden));
 await assert.rejects(h.identity.getVerifiedAuthor(actor),{code:'GITHUB_AUTHOR_NOT_VERIFIED'});assert.equal(h.calls.length,2);
});

test('commit identity requires verified GitHub email and a current same-user check',async()=>{
 const h=identityHarness();await h.link();h.queue.push({url:'https://api.github.com/user',data:user},{url:'https://api.github.com/user/emails',data:[{email:'noreply@example.test',verified:false}]});await assert.rejects(h.identity.selectCommitIdentity({actor,origin,email:'noreply@example.test'}),{code:'GITHUB_AUTHOR_EMAIL_UNVERIFIED'});
 h.queue.push({url:'https://api.github.com/user',data:user},{url:'https://api.github.com/user/emails',data:[{email:'author@fixture.example',verified:true}]});assert.equal((await h.identity.selectCommitIdentity({actor,origin,email:'author@fixture.example'})).commitIdentityReady,true);h.queue.push({url:'https://api.github.com/user',data:user});const author=await h.identity.getVerifiedAuthor(actor);assert.equal(author.githubUserId,'8');assert.equal(author.publicEmailConsent,true);assert.equal(author.verified,true);
 h.queue.push({url:'https://api.github.com/user',data:{...user,id:99}});await assert.rejects(h.identity.getVerifiedAuthor(actor),{code:'GITHUB_IDENTITY_CHANGED'});
});

test('tokens refresh privately and revoked identity does not retain commit authority',async()=>{
 const h=identityHarness();await h.link();h.queue.push({url:'https://api.github.com/user',data:user},{url:'https://api.github.com/user/emails',data:[{email:'author@fixture.example',verified:true}]});await h.identity.selectCommitIdentity({actor,origin,email:'author@fixture.example'});h.advance(28800*1000);h.queue.push({url:'https://github.com/login/oauth/access_token',data:{...tokens,access_token:['ghu','private_refreshed_user_token'].join('_')}},{url:'https://api.github.com/user',data:user});assert.equal((await h.identity.getVerifiedAuthor(actor)).verified,true);assert.equal(new URLSearchParams(h.calls.at(-2).init.body).get('grant_type'),'refresh_token');assert.equal(h.calls.at(-1).init.headers.Authorization,'Bearer '+['ghu','private_refreshed_user_token'].join('_'));
 h.queue.push({url:'https://api.github.com/user',data:{error:'Bad credentials'},status:401});await assert.rejects(h.identity.getVerifiedAuthor(actor),{code:'GITHUB_IDENTITY_UNAVAILABLE'});const unlink=await h.identity.unlink({actor,origin});assert.deepEqual(unlink,{linked:false,publicHistoryDeleted:false});await assert.rejects(h.identity.getVerifiedAuthor(actor),{code:'GITHUB_IDENTITY_NOT_LINKED'});
});

test('sign-out invalidates an enrollment callback already in flight',async()=>{
 const h=identityHarness(),begin=await h.identity.begin({actor,origin}),state=new URL(begin.authorizationUrl).searchParams.get('state');await h.identity.unlink({actor,origin});h.oauth();await assert.rejects(h.identity.complete({actor,state,code:'one',url:callback+'?code=one&state='+state}),{code:'REVISION_CONFLICT'});assert.equal((await h.identity.status({actor})).linked,false);
});

test('trusted origin and configured callback/client are mandatory; arbitrary token endpoints are absent',async()=>{
 const h=identityHarness();await assert.rejects(h.identity.begin({actor,origin:'https://evil.test'}),{code:'GITHUB_IDENTITY_ORIGIN_DENIED'});await assert.rejects(h.identity.selectCommitIdentity({actor,origin:'https://evil.test',email:'x@y.test'}),{code:'GITHUB_IDENTITY_ORIGIN_DENIED'});assert.throws(()=>createGithubIdentityService({store:h.store,callbackUrl:'http://localhost/callback'}),{code:'GITHUB_CALLBACK_CONFIGURATION_INVALID'});
 const disabled=identityHarness({clientSecret:null});await assert.rejects(disabled.identity.begin({actor,origin}),{code:'GITHUB_APP_NOT_CONFIGURED'});assert.equal(h.calls.length,0);
});

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const key=privateKey.export({type:'pkcs8',format:'pem'});
function brokerHarness(options={}){
 const calls=[],token='ghs_12345_'+('variable_length_stateless.'.repeat(30));let now=NOW;
 const broker=createGithubTokenBroker({appId:'Iv1.app-id',privateKey:key,allowedRepositoryIds:['42'],authorize:async()=>true,now:()=>now,fetcher:async(url,init)=>{calls.push({url,init});return json({token,expires_at:new Date(now+3600000).toISOString(),repositories:[{id:42}],permissions:JSON.parse(init.body).permissions,...options.result});},...options});return {broker,calls,token,advance:value=>{now+=value;}};
}
test('App signs a bounded RS256 JWT and requests one repository and exact reduced permissions',async()=>{
 const h=brokerHarness(),input={repository,actor,grant:{id:'grant'},permissions:{contents:'write'}};const safe=await h.broker.run(input,async token=>{assert.equal(token,h.token);return {authorized:true};});assert.deepEqual(safe,{authorized:true});assert.equal(h.calls[0].url,'https://api.github.com/app/installations/17/access_tokens');assert.equal(h.calls[0].init.headers['X-GitHub-Api-Version'],GITHUB_API_VERSION);assert.deepEqual(JSON.parse(h.calls[0].init.body),{repository_ids:[42],permissions:{contents:'write'}});
 const jwt=h.calls[0].init.headers.Authorization.slice(7),parts=jwt.split('.');assert.equal(JSON.parse(Buffer.from(parts[0],'base64url')).alg,'RS256');assert.equal(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),publicKey,Buffer.from(parts[2],'base64url')),true);const payload=JSON.parse(Buffer.from(parts[1],'base64url'));assert.ok(payload.exp-payload.iat<=600);assert.ok(payload.iat<Math.floor(NOW/1000));assert.equal(h.calls[0].init.redirect,'manual');
 await h.broker.run(input,async()=>({authorized:true}));assert.equal(h.calls.length,1);h.broker.invalidate();await h.broker.run(input,async()=>({authorized:true}));assert.equal(h.calls.length,2);
});

test('App token scope, repository and expiry mismatches fail before credentials reach provider',async()=>{
 for(const result of [{repositories:[{id:99}]},{repositories:[{id:42},{id:43}]},{permissions:{contents:'write',issues:'write'}},{permissions:{}},{expires_at:new Date(NOW-1).toISOString()}]){const h=brokerHarness({result});let dispatched=false;await assert.rejects(h.broker.run({repository,actor,permissions:{contents:'read'}},async()=>{dispatched=true;}),{code:'GITHUB_TOKEN_SCOPE_UNVERIFIED'});assert.equal(dispatched,false);}
 const h=brokerHarness();for(const input of [{repository:{...repository,id:'99'},permissions:{contents:'read'}},{repository,permissions:{actions:'write'}},{repository,permissions:{checks:'write'}}])await assert.rejects(h.broker.run(input,async()=>{}));assert.equal(h.calls.length,0);
});

test('revoked host permission and invalidated in-flight token never dispatch to GitHub repository API',async()=>{
 let enabled=true;const h=brokerHarness({authorize:async()=>enabled});await h.broker.run({repository,actor,permissions:{contents:'read'}},async()=>{});enabled=false;await assert.rejects(h.broker.run({repository,actor,permissions:{contents:'read'}},async()=>assert.fail('Revoked token dispatched')),{code:'GITHUB_INSTALLATION_SCOPE_DENIED'});
 let release;const pending=new Promise(resolve=>{release=resolve;});let broker;broker=createGithubTokenBroker({appId:'123',privateKey:key,allowedRepositoryIds:['42'],authorize:async()=>true,now:()=>NOW,fetcher:async()=>{await pending;return json({token:'ghs_private_token',expires_at:new Date(NOW+3600000).toISOString(),repositories:[{id:42}],permissions:{contents:'read'}});}});const run=broker.run({repository,actor,permissions:{contents:'read'}},async()=>assert.fail('Invalidated token dispatched'));broker.invalidate();release();await assert.rejects(run,{code:'GITHUB_INSTALLATION_SCOPE_DENIED'});
});
