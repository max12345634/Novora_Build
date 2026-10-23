'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const updater=require('../src/updater');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/latest.json'),'utf8'));
const signedBytes=fs.readFileSync(path.join(__dirname,'fixtures/version-label.js.txt'));
function sandbox(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'novora-persistent-'));
  const root=path.join(base,'bot'),dir=path.join(base,'stage');
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  const target=path.join(root,'src/version-label.js');
  fs.writeFileSync(target,'module.exports={VERSION:"old"};\n');
  fs.writeFileSync(path.join(dir,'src/version-label.js'),signedBytes);
  fs.writeFileSync(path.join(root,'data','user-data.json'),'DO NOT CHANGE');
  return {base,root,dir,target,release:{manifest,dir},cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('V4.17.3: persistent backup and journal survive a simulated container temp wipe',()=>{
  const s=sandbox();
  try{
    const tx=updater.backupAndInstall(s.root,s.release);
    const journal=updater.pendingRecovery(s.root);
    assert.ok(journal);
    assert.ok(journal.backup.startsWith(path.join(s.root,'data','update-backups')));
    assert.ok(fs.existsSync(path.join(journal.backup,'src/version-label.js')));
    assert.equal(fs.readFileSync(path.join(s.root,'data/user-data.json'),'utf8'),'DO NOT CHANGE');
    tx.rollback();
    assert.equal(updater.pendingRecovery(s.root),null);
    assert.equal(fs.existsSync(journal.backup),false);
    assert.match(fs.readFileSync(s.target,'utf8'),/old/);
  }finally{s.cleanup()}
});
test('V4.17.3: successful commit removes journal and backup only after explicit finish',()=>{
  const s=sandbox();
  try{
    const tx=updater.backupAndInstall(s.root,s.release);
    const {backup}=updater.pendingRecovery(s.root);
    assert.deepEqual(fs.readFileSync(s.target),signedBytes);
    tx.finish();
    assert.equal(updater.pendingRecovery(s.root),null);
    assert.equal(fs.existsSync(backup),false);
    assert.equal(fs.readFileSync(path.join(s.root,'data/user-data.json'),'utf8'),'DO NOT CHANGE');
  }finally{s.cleanup()}
});
test('V4.17.3: restart refuses to launch worker while a transaction journal exists',()=>{
  const s=sandbox();
  const oldLoad=Module._load;
  let tx,controller;
  try{
    tx=updater.backupAndInstall(s.root,s.release);
    Module._load=function(request,parent,isMain){
      if(request==='dotenv')return {config:()=>({})};
      return oldLoad.apply(this,arguments);
    };
    delete require.cache[require.resolve('../src/supervisor')];
    const {start}=require('../src/supervisor');
    Module._load=oldLoad;
    let launched=0;
    controller=start({root:s.root,launch:()=>{launched++;throw Error('must not launch')}});
    assert.equal(launched,0);
    assert.equal(controller.isReady(),false);
    const status=JSON.parse(fs.readFileSync(path.join(s.root,'data/update-status.json'),'utf8'));
    assert.equal(status.manualRecoveryRequired,true);
    assert.match(status.error,/Manuelle Wiederherstellung/);
    assert.ok(updater.pendingRecovery(s.root));
    assert.equal(fs.readFileSync(path.join(s.root,'data/user-data.json'),'utf8'),'DO NOT CHANGE');
  }finally{
    Module._load=oldLoad;
    controller?.shutdown();
    // Simulate manual restore: only for the isolated test sandbox.
    tx?.rollback();
    s.cleanup();
  }
});
test('V4.17.3: a corrupt journal fails closed instead of launching an unverified worker',()=>{
  const s=sandbox();const oldLoad=Module._load;
  try{
    fs.writeFileSync(updater.recoveryJournal(s.root),'{not valid json');
    Module._load=function(request,parent,isMain){if(request==='dotenv')return {config:()=>({})};return oldLoad.apply(this,arguments)};
    delete require.cache[require.resolve('../src/supervisor')];
    const {start}=require('../src/supervisor');Module._load=oldLoad;
    let launched=0;
    const controller=start({root:s.root,launch:()=>{launched++;throw Error('unexpected')}});
    assert.equal(launched,0);assert.equal(controller.isReady(),false);
    controller.shutdown();
  }finally{Module._load=oldLoad;s.cleanup()}
});

test('V4.17.3: journal creation failure never modifies the installed bot',()=>{
  const s=sandbox(),original=fs.renameSync;
  try{
    fs.renameSync=function(from,to){
      if(String(to).endsWith('update-recovery.json'))throw Error('simulated journal write failure');
      return original.apply(this,arguments);
    };
    assert.throws(()=>updater.backupAndInstall(s.root,s.release),/simulated journal write failure/);
    assert.match(fs.readFileSync(s.target,'utf8'),/old/);
    assert.equal(updater.pendingRecovery(s.root),null);
    assert.equal(fs.readFileSync(path.join(s.root,'data/user-data.json'),'utf8'),'DO NOT CHANGE');
  }finally{fs.renameSync=original;s.cleanup()}
});
