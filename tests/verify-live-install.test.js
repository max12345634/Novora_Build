'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const live=require('../scripts/verify-live-install');

function response({status=200,body='ok',version='4.18.3'}={}){
  return new Response(body,{status,headers:{'X-Novora-Version':version,'Content-Type':'text/plain'}});
}

test('live health requires HTTP 200, exact body and version header',async()=>{
  assert.equal(await live.healthVersion(async()=>response()),'4.18.3');
  await assert.rejects(()=>live.healthVersion(async()=>response({body:'starting'})),/nicht "ok"/);
  await assert.rejects(()=>live.healthVersion(async()=>response({status:503})),/HTTP 503/);
  await assert.rejects(()=>live.healthVersion(async()=>new Response('x'.repeat(2048),{
    status:200,headers:{'X-Novora-Version':'4.18.3'}
  })),/Größenlimit/);
});

test('live wait accepts only the requested version after polling',async()=>{
  let calls=0;
  // waitForVersion uses the module-local feed verifier first. Feed validation is
  // covered by updater tests; use a fetch multiplexer here to exercise polling.
  const fetchImpl=async url=>{
    if(String(url).includes('latest.json')){
      const fixture=require('./fixtures/latest.json');
      return new Response(JSON.stringify(fixture),{status:200,headers:{'Content-Type':'application/json'}});
    }
    calls++;
    return response({version:calls===1?'3.1.0':fixture.version});
  };
  // Use the fixture's signed version to keep the feed signature boundary real.
  const fixture=require('./fixtures/latest.json');
  const result=await live.waitForVersion(fixture.version,{fetchImpl,waitMs:100,intervalMs:1});
  assert.equal(result.version,fixture.version);
  assert.equal(calls,2);
});
