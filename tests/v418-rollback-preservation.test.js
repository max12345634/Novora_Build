'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const updater=require('../src/updater');
const fixture=path.join(__dirname,'fixtures');
const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'latest.json'),'utf8'));
const bytes=fs.readFileSync(path.join(fixture,'version-label.js.txt'));
function sandbox(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'novora-rollback-'));
  const root=path.join(base,'bot'),dir=path.join(base,'stage');
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  const target=path.join(root,'src/version-label.js');
  fs.writeFileSync(target,'module.exports={VERSION:"original"};\n');
  fs.writeFileSync(path.join(dir,'src/version-label.js'),bytes);
  return {base,root,dir,target,release:{manifest,dir},cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('V4.18 hardening: rollback failure keeps backup and raises a critical error',()=>{
  const s=sandbox();
  const originalCopy=fs.copyFileSync;
  try{
    const tx=updater.backupAndInstall(s.root,s.release);
    fs.copyFileSync=function(source,dest,...rest){
      if(String(source).includes('novora-backup-')&&String(dest).includes('.novora-rollback-'))throw Error('simulated restore failure');
      return originalCopy.call(this,source,dest,...rest);
    };
    let message='';
    assert.throws(()=>tx.rollback(),e=>{message=e.message;return /Rollback fehlgeschlagen/.test(message)});
    const backup=message.match(/Sicherung: (\/[^;\n]+)/)?.[1];
    assert.ok(backup,'error must include manual recovery location');
    assert.equal(fs.existsSync(path.join(backup,'src/version-label.js')),true);
    fs.copyFileSync=originalCopy;
    tx.rollback();
    assert.equal(fs.existsSync(backup),false);
    assert.match(fs.readFileSync(s.target,'utf8'),/original/);
  }finally{fs.copyFileSync=originalCopy;s.cleanup()}
});
test('V4.18 hardening: a normal rollback still restores the original',()=>{
  const s=sandbox();
  try{const tx=updater.backupAndInstall(s.root,s.release);tx.rollback();assert.match(fs.readFileSync(s.target,'utf8'),/original/)}
  finally{s.cleanup()}
});


test('V4.17.5: automatic rollback rejects tampered backup before touching installed files',()=>{
 const s=sandbox();
 try{
   const tx=updater.backupAndInstall(s.root,s.release);
   const installed=fs.readFileSync(s.target);
   const backup=updater.pendingRecovery(s.root).backup;
   fs.appendFileSync(path.join(backup,'src/version-label.js'),'TAMPER');
   assert.throws(()=>tx.rollback(),/Sicherung beschädigt|Sicherung verändert/);
   assert.deepEqual(fs.readFileSync(s.target),installed);
   assert.ok(updater.pendingRecovery(s.root));
   assert.equal(fs.existsSync(backup),true);
 }finally{s.cleanup()}
});

test('V4.17.5: automatic rollback rejects symlinked backup before modifying live files',()=>{
 const s=sandbox();
 try{
   const tx=updater.backupAndInstall(s.root,s.release);
   const installed=fs.readFileSync(s.target);
   const backup=updater.pendingRecovery(s.root).backup;
   const source=path.join(backup,'src/version-label.js');
   fs.rmSync(source);fs.symlinkSync(s.target,source);
   assert.throws(()=>tx.rollback(),/Symbolischer Link/);
   assert.deepEqual(fs.readFileSync(s.target),installed);
   assert.ok(updater.pendingRecovery(s.root));
 }finally{s.cleanup()}
});
