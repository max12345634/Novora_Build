'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {makeStore} = require('../src/store');
const key = crypto.randomBytes(32).toString('hex');
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-v411-'));
  return {dir,store:makeStore(dir,key),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function leftovers(dir){return fs.readdirSync(dir).filter(n=>n.startsWith('.state-')&&n.endsWith('.tmp'));}
test('V4.11: persisted state is owner-only and survives a fresh reload',async()=>{
 const h=fixture();try{
  h.store.state.guilds['123']={panelMessageId:'456'};
  await h.store.persist();
  const stat=fs.statSync(path.join(h.dir,'state.json'));
  if(process.platform!=='win32')assert.equal(stat.mode&0o777,0o600);
  assert.equal(makeStore(h.dir,key).state.guilds['123'].panelMessageId,'456');
  assert.deepEqual(leftovers(h.dir),[]);
 }finally{h.cleanup();}
});
test('V4.11: fixed legacy state.json.tmp is not overwritten',async()=>{
 const h=fixture();try{
  const old=path.join(h.dir,'state.json.tmp');fs.writeFileSync(old,'DO NOT TOUCH');
  h.store.state.guilds['1']={ok:true};await h.store.persist();
  assert.equal(fs.readFileSync(old,'utf8'),'DO NOT TOUCH');
  assert.equal(makeStore(h.dir,key).state.guilds['1'].ok,true);
 }finally{h.cleanup();}
});
test('V4.11: a symlinked old temp file cannot redirect a state write',async(t)=>{
 const h=fixture();try{
  const outside=path.join(h.dir,'unrelated.txt');fs.writeFileSync(outside,'UNCHANGED');
  try{fs.symlinkSync(outside,path.join(h.dir,'state.json.tmp'));}
  catch(err){if(['EPERM','ENOSYS','EACCES'].includes(err.code)){t.skip('symlinks unsupported');return;}throw err;}
  h.store.state.guilds['2']={ok:true};await h.store.persist();
  assert.equal(fs.readFileSync(outside,'utf8'),'UNCHANGED');
  assert.equal(makeStore(h.dir,key).state.guilds['2'].ok,true);
 }finally{h.cleanup();}
});
test('V4.11: concurrent saves serialize snapshots and leave no temp files',async()=>{
 const h=fixture();try{
  const tasks=[];
  for(let i=0;i<25;i++){
   h.store.state.guilds.counter=i;
   tasks.push(h.store.persist());
  }
  await Promise.all(tasks);
  assert.equal(makeStore(h.dir,key).state.guilds.counter,24);
  assert.deepEqual(leftovers(h.dir),[]);
 }finally{h.cleanup();}
});
test('V4.11: failed rename preserves last committed state and cleans temporary file',async()=>{
 const h=fixture();const rename=fs.promises.rename;
 try{
  h.store.state.guilds.counter=1;await h.store.persist();
  fs.promises.rename=async()=>{throw Object.assign(Error('disk failure'),{code:'EIO'});};
  h.store.state.guilds.counter=2;
  await assert.rejects(h.store.persist(),/disk failure/);
  assert.equal(makeStore(h.dir,key).state.guilds.counter,1);
  assert.deepEqual(leftovers(h.dir),[]);
 }finally{fs.promises.rename=rename;h.cleanup();}
});
test('V4.11: later successful save recovers after an earlier failed write',async()=>{
 const h=fixture();const rename=fs.promises.rename;
 try{
  h.store.state.guilds.counter=1;await h.store.persist();
  fs.promises.rename=async()=>{throw Error('temporary failure');};
  h.store.state.guilds.counter=2;
  await assert.rejects(h.store.persist(),/temporary failure/);
  fs.promises.rename=rename;
  h.store.state.guilds.counter=3;await h.store.persist();
  assert.equal(makeStore(h.dir,key).state.guilds.counter,3);
  assert.deepEqual(leftovers(h.dir),[]);
 }finally{fs.promises.rename=rename;h.cleanup();}
});
