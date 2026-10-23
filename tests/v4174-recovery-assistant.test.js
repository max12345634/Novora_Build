'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const updater=require('../src/updater');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/latest.json'),'utf8'));
const signedBytes=fs.readFileSync(path.join(__dirname,'fixtures/version-label.js.txt'));
function sandbox(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'novora-recover-'));
  const root=path.join(base,'bot'),dir=path.join(base,'stage');
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  const target=path.join(root,'src/version-label.js');
  const original=Buffer.from('module.exports={VERSION:"old"};\n');
  fs.writeFileSync(target,original);
  fs.writeFileSync(path.join(dir,'src/version-label.js'),signedBytes);
  const userData=path.join(root,'data','important.json');
  fs.writeFileSync(userData,'PRESERVE ME');
  const receipt=updater.backupAndInstall(root,{manifest,dir});
  return {base,root,dir,target,original,receipt,userData,cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('V4.17.4: recovery preview is read-only and journal contains verified SHA-256',()=>{
  const s=sandbox();
  try{
    const j=JSON.parse(fs.readFileSync(updater.recoveryJournal(s.root),'utf8'));
    assert.equal(j.schema,2);
    assert.match(j.files[0].sha256,/^[a-f0-9]{64}$/);
    const result=updater.recoverPendingUpdate(s.root);
    assert.equal(result.pending,true);
    assert.equal(result.restored,false);
    assert.deepEqual(fs.readFileSync(s.target),signedBytes);
    assert.ok(updater.pendingRecovery(s.root));
  }finally{s.cleanup()}
});
test('V4.17.4: explicit offline restore reverts code and preserves data, clears startup block',()=>{
  const s=sandbox();
  try{
    updater.saveStatus(s.root,{manualRecoveryRequired:true,error:'KRITISCH'});
    assert.throws(()=>updater.recoverPendingUpdate(s.root,{apply:true}),/Bot vor Wiederherstellung stoppen/);
    const result=updater.recoverPendingUpdate(s.root,{apply:true,botStopped:true});
    assert.equal(result.restored,true);
    assert.deepEqual(fs.readFileSync(s.target),s.original);
    assert.equal(fs.readFileSync(s.userData,'utf8'),'PRESERVE ME');
    assert.equal(updater.pendingRecovery(s.root),null);
    const status=JSON.parse(fs.readFileSync(updater.statusFile(s.root),'utf8'));
    assert.equal(status.manualRecoveryRequired,false);
    assert.equal(status.error,null);
    assert.equal(updater.recoverPendingUpdate(s.root,{apply:true,botStopped:true}).restored,false);
  }finally{s.cleanup()}
});
test('V4.17.4: modified backup is rejected without touching live installation',()=>{
  const s=sandbox();
  try{
    const {backup}=updater.pendingRecovery(s.root);
    fs.writeFileSync(path.join(backup,'src/version-label.js'),'tampered');
    assert.throws(()=>updater.recoverPendingUpdate(s.root,{apply:true,botStopped:true}),/Sicherungsdatei verändert/);
    assert.deepEqual(fs.readFileSync(s.target),signedBytes);
    assert.ok(updater.pendingRecovery(s.root));
  }finally{s.cleanup()}
});
test('V4.17.4: journal path traversal and external backup location are rejected',()=>{
  for(const mutation of [j=>{j.files[0].path='../data/important.json'},j=>{j.backup='/tmp/novora-backup-external'}]){
    const s=sandbox();
    try{
      const file=updater.recoveryJournal(s.root),j=JSON.parse(fs.readFileSync(file,'utf8'));
      mutation(j);fs.writeFileSync(file,JSON.stringify(j));
      assert.throws(()=>updater.recoverPendingUpdate(s.root,{apply:true,botStopped:true}),/Unsicherer/);
      assert.deepEqual(fs.readFileSync(s.target),signedBytes);
      assert.equal(fs.readFileSync(s.userData,'utf8'),'PRESERVE ME');
    }finally{s.cleanup()}
  }
});
test('V4.17.4: symlinked backup is refused and no files are changed',()=>{
  const s=sandbox();
  try{
    const {backup}=updater.pendingRecovery(s.root);
    const file=path.join(backup,'src/version-label.js');
    fs.rmSync(file);fs.symlinkSync(s.userData,file);
    assert.throws(()=>updater.recoverPendingUpdate(s.root,{apply:true,botStopped:true}),/Symbolischer Link/);
    assert.deepEqual(fs.readFileSync(s.target),signedBytes);
  }finally{s.cleanup()}
});
test('V4.17.4: corrupt and old-schema journals fail closed',()=>{
  for(const bad of ['{bad json',JSON.stringify({schema:1,backup:'/tmp',files:[{path:'src/version-label.js',existed:true}]})]){
    const s=sandbox();
    try{
      fs.writeFileSync(updater.recoveryJournal(s.root),bad);
      assert.throws(()=>updater.recoverPendingUpdate(s.root,{apply:true,botStopped:true}),/Journal|Wiederherstellungsjournal/);
      assert.deepEqual(fs.readFileSync(s.target),signedBytes);
    }finally{s.cleanup()}
  }
});
test('V4.17.4: CLI defaults to a read-only preview',()=>{
  const out=execFileSync(process.execPath,[path.join(__dirname,'../scripts/recover-update.js')],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  assert.match(out,/Kein offenes Update-Journal/);
});
