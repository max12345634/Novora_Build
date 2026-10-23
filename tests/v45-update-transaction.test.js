'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const updater=require('../src/updater');
const fixture=path.join(__dirname,'fixtures');
const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'latest.json'),'utf8'));
const signedBytes=fs.readFileSync(path.join(fixture,'version-label.js.txt'));
function sandbox(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'nv45-update-'));
  const root=path.join(base,'bot'),dir=path.join(base,'stage');
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  const target=path.join(root,'src/version-label.js');
  const source=path.join(dir,'src/version-label.js');
  fs.writeFileSync(target,'module.exports={VERSION:"old"};\n');
  fs.writeFileSync(source,signedBytes);
  return {base,root,dir,target,source,release:{manifest,dir},cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('V4.5: staged bytes changed after download are rejected without touching live code',()=>{
  const s=sandbox();
  try{
    fs.writeFileSync(s.source,'module.exports={VERSION:"evil"};\n');
    assert.throws(()=>updater.backupAndInstall(s.root,s.release),/Staging|Prüfsumme/);
    assert.match(fs.readFileSync(s.target,'utf8'),/old/);
  }finally{s.cleanup();}
});
test('V4.5: symlinked live destination directories cannot redirect updates outside the bot',()=>{
  const s=sandbox();
  try{
    const external=path.join(s.base,'external');fs.mkdirSync(external);
    fs.renameSync(path.join(s.root,'src'),path.join(s.root,'original-src'));
    fs.symlinkSync(external,path.join(s.root,'src'),'dir');
    assert.throws(()=>updater.backupAndInstall(s.root,s.release),/Symbolischer Link/);
    assert.deepEqual(fs.readdirSync(external),[]);
    assert.match(fs.readFileSync(path.join(s.root,'original-src/version-label.js'),'utf8'),/old/);
  }finally{s.cleanup();}
});
test('V4.5: staged symlink is rejected even when it points to correctly signed bytes',()=>{
  const s=sandbox();
  try{
    const other=path.join(s.base,'other.js');fs.writeFileSync(other,signedBytes);
    fs.unlinkSync(s.source);fs.symlinkSync(other,s.source);
    assert.throws(()=>updater.backupAndInstall(s.root,s.release),/Symbolischer Link/);
    assert.match(fs.readFileSync(s.target,'utf8'),/old/);
  }finally{s.cleanup();}
});
test('V4.5: preexisting legacy .novora-new sentinel is never overwritten',()=>{
  const s=sandbox();
  try{
    const sentinel=s.target+'.novora-new';fs.writeFileSync(sentinel,'do-not-touch');
    const tx=updater.backupAndInstall(s.root,s.release);
    assert.deepEqual(fs.readFileSync(s.target),signedBytes);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'do-not-touch');
    tx.rollback();
    assert.match(fs.readFileSync(s.target,'utf8'),/old/);
  }finally{s.cleanup();}
});
