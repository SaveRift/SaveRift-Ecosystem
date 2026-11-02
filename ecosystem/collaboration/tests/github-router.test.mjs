// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubRouter} from '../github-router.mjs';
import {createGithubIdentityService} from '../github-identity.mjs';
import {createMemoryStore} from '../../workbench/storage.mjs';

const origin='https://developer.fixture.example',base='/api/developer/github',callback=origin+base+'/callback';
const actor={id:'test-developer',scopes:['git:read','git:commit']};
const request=(path,options={})=>new Request(origin+base+path,{...options,headers:{origin,'sec-fetch-site':'same-origin',...(options.body?{'content-type':'application/json'}:{}),...options.headers}});
function harness({principal=actor,identity,...options}={}){const calls=[];identity=identity===undefined?{status:async()=>({configured:true,linked:false,githubUser:null}),begin:async value=>{calls.push(['begin',value]);return {authorizationUrl:'https://github.com/login/oauth/authorize?client_id=fixture',expiresAt:123};},complete:async value=>{calls.push(['complete',value]);return {linked:true};},selectCommitIdentity:async value=>{calls.push(['identity',value]);return {commitIdentityReady:true};},unlink:async value=>{calls.push(['unlink',value]);return {linked:false};}}:identity;return {calls,route:createGithubRouter({identity,authenticate:async()=>principal,allowedHosts:['developer.fixture.example'],allowedOrigins:[origin],...options})};}

test('not-configured status is honest and never links the unrelated ChatGPT GitHub connector',async()=>{
 const h=harness({identity:null}),status=await h.route(request('/status'));assert.equal(status.status,200);assert.deepEqual(await status.json(),{configured:false,linked:false,githubUser:null,commitIdentityReady:false});const begin=await h.route(request('/begin',{method:'POST',body:'{}'}));assert.equal(begin.status,503);assert.equal((await begin.json()).code,'GITHUB_APP_NOT_CONFIGURED');assert.equal(status.headers.get('cache-control'),'no-store');
});
test('exact host/origin, verified principal and explicit route scopes are mandatory',async()=>{
 const h=harness();assert.equal((await h.route(new Request('https://evil.example'+base+'/status'))).status,403);assert.equal((await h.route(request('/status',{headers:{origin:'https://evil.example'}}))).status,403);assert.equal((await h.route(request('/status',{headers:{'sec-fetch-site':'cross-site'}}))).status,403);assert.equal((await h.route(request('/begin',{method:'POST',body:'{}',headers:{origin:''}}))).status,403);
 assert.equal((await harness({principal:null}).route(request('/status'))).status,401);assert.equal((await harness({principal:{id:'test',scopes:['developer']}}).route(request('/status'))).status,403);
 const readOnly=harness({principal:{id:'test',scopes:['git:read']}});assert.equal((await readOnly.route(request('/status'))).status,200);assert.equal((await readOnly.route(request('/identity',{method:'POST',body:'{"email":"author@fixture.example"}'}))).status,403);assert.equal(h.calls.length,0);
});
test('begin and consent routes accept only bounded exact JSON with no client credentials or authority',async()=>{
 const h=harness();assert.equal((await h.route(request('/begin',{method:'POST',body:'{}'}))).status,200);assert.equal(h.calls[0][1].actor.id,actor.id);assert.equal(h.calls[0][1].origin,origin);
 for(const body of ['{"actor":"forged"}','{"email":"a@fixture.example","email":"b@fixture.example"}','[]','null','{"email":"a@fixture.example","token":"no"}'])assert.equal((await h.route(request('/identity',{method:'POST',body}))).status,400);
 assert.equal((await h.route(request('/identity',{method:'POST',body:JSON.stringify({email:'author@fixture.example'})}))).status,200);assert.equal(h.calls.at(-1)[0],'identity');assert.equal(h.calls.at(-1)[1].email,'author@fixture.example');
 assert.equal((await h.route(request('/begin',{method:'POST',body:JSON.stringify({padding:'x'.repeat(3000)})}))).status,413);assert.equal((await h.route(request('/begin',{method:'POST',body:'{}',headers:{'content-type':'text/plain'}}))).status,400);
});
test('callback is the only cross-site exception and redirects solely to the same-origin workbench',async()=>{
 const h=harness(),callbackRequest=request('/callback?code=one&state=state',{headers:{origin:'https://github.com','sec-fetch-site':'cross-site'}}),result=await h.route(callbackRequest);assert.equal(result.status,303);assert.equal(result.headers.get('location'),origin+'/developer?github=linked');assert.deepEqual(h.calls[0],['complete',{actor,state:'state',code:'one',url:callback+'?code=one&state=state'}]);assert.equal(await result.text(),'');
 assert.equal((await h.route(request('/callback?code=one&code=two&state=state'))).status,400);assert.equal((await h.route(request('/callback?error=denied&state=state'))).status,400);assert.equal((await h.route(request('/callback',{method:'POST',body:'{}'}))).status,405);assert.equal((await h.route(request('/begin'))).status,405);
 assert.equal(await h.route(new Request(origin+'/api/developer/status')),null);
});
test('actual identity service validates callback state and consumes it only once behind hosted routes',async()=>{
 const identity=createGithubIdentityService({store:createMemoryStore(),clientId:'Iv1.fixture',clientSecret:['private','fixture','client','secret'].join('-'),callbackUrl:callback,allowedOrigins:[origin],authorize:async()=>true,fetcher:async url=>url==='https://github.com/login/oauth/access_token'?Response.json({access_token:['ghu','private_test_token'].join('_'),refresh_token:['ghr','private_refresh_token'].join('_'),expires_in:28800}):Response.json({id:8,login:'fixture-user',name:'Fixture User'})}),h=harness({identity});
 const begin=await (await h.route(request('/begin',{method:'POST',body:'{}'}))).json(),state=new URL(begin.authorizationUrl).searchParams.get('state');assert.equal((await h.route(request('/callback?code=accepted&state=wrong',{headers:{'sec-fetch-site':'cross-site'}}))).status,409);
 const done=await h.route(request('/callback?code=accepted&state='+state,{headers:{'sec-fetch-site':'cross-site'}}));assert.equal(done.status,303);const status=await (await h.route(request('/status'))).json();assert.equal(status.githubUser.login,'fixture-user');assert.equal(status.linked,true);assert.ok(!JSON.stringify(status).includes('token'));assert.equal((await h.route(request('/callback?code=accepted&state='+state))).status,409);
});
test('host errors do not leak tokens, cookies or private upstream diagnostics',async()=>{
 const h=harness({identity:{status:async()=>{throw Object.assign(Error('cookie=private; credential=private'),{code:'GITHUB_UPSTREAM_FAILED',status:502});}}}),response=await h.route(request('/status')),value=await response.json();assert.equal(response.status,502);assert.equal(value.code,'GITHUB_UPSTREAM_FAILED');assert.ok(!JSON.stringify(value).includes('credential'));assert.equal(response.headers.has('set-cookie'),false);
});
