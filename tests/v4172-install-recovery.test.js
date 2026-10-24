'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const updater=require('../src/updater');
const Module=require('node:module');
const fixture=path.join(__dirname,'fixtures');
const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'latest.json'),'utf8'));
const signedBytes=fs.readFileSync(path.join(fixture,'version-label.js.txt'));
function sandbox(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'novora-critical-'));
  const root=path.join(base,'bot'),dir=path.join(base,'stage');
  fs.mkdirSync(path.join(root,'src'),{recursive:true});fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  const target=path.join(root,'src/version-label.js');
  fs.writeFileSync(target,'module.exports={VERSION:"3.1.0"};\n');
  fs.writeFileSync(path.join(dir,'src/version-label.js'),signedBytes);
  return {base,root,dir,target,release:{manifest,dir},cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
function failInstallAndRestore(s){
  const original=fs.copyFileSync;
  fs.copyFileSync=function(source,dest,...args){
    if(String(dest).includes('.novora-')&&String(dest).endsWith('.tmp'))throw Error('simulated installation write failure');
    if(String(source).includes('novora-backup-')&&dest===s.target)throw Error('simulated rollback write failure');
    return original.call(this,source,dest,...args);
  };
  return ()=>{fs.copyFileSync=original};
}
test('V4.17.2: failed installation AND rollback emits explicit critical recovery signal and retains backup',()=>{
  const s=sandbox(),restore=failInstallAndRestore(s);
  let recoveryPath;
  try{
    assert.throws(()=>updater.backupAndInstall(s.root,s.release),e=>{
      assert.equal(e.manualRecoveryRequired,true);
      recoveryPath=e.recoveryPath;
      assert.ok(recoveryPath&&fs.existsSync(path.join(recoveryPath,'src/version-label.js')));
      assert.match(e.message,/Installation fehlgeschlagen.*Rollback fehlgeschlagen/);
      return true;
    });
  }finally{restore();if(recoveryPath)fs.rmSync(recoveryPath,{recursive:true,force:true});s.cleanup()}
});
test('V4.17.2: supervisor does not restart a worker after installation-time rollback failure',async()=>{
  const s=sandbox();
  const originalFetch=global.fetch;
  const originalCopy=fs.copyFileSync;
  const originalEnv=process.env.NOVORA_AUTO_UPDATE;
  const originalLoad=Module._load;
  const originalCheckRelease=updater.checkRelease;
  const oldDir=process.env.DATA_DIR;
  let supervisor;
  let launched=0;
  let recoveryPath;
  try{
    process.env.NOVORA_AUTO_UPDATE='true';
    process.env.DATA_DIR=path.join(s.root,'data');
    // The manifest fixture is genuinely signed, and the downloaded byte matches.
    global.fetch=async url=>String(url).endsWith('/latest.json')?new Response(JSON.stringify(manifest)):
      String(url).endsWith('/version-label.js.txt')?new Response(signedBytes):new Response('not found',{status:404});
    const restore=failInstallAndRestore(s);
    // Inject the already verified signed fixture without network or a private key.
    updater.checkRelease=async()=>s.release;
    Module._load=function(request,parent,isMain){
      if(request==='dotenv')return {config:()=>({})};
      return originalLoad.apply(this,arguments);
    };
    delete require.cache[require.resolve('../src/supervisor')];
    const {start}=require('../src/supervisor');
    Module._load=originalLoad;
    // The live worker is stopped before installing; its exit must not trigger a restart.
    supervisor=start({root:s.root,launch:()=>{
      launched++;
      const child=new EventEmitter();child.exitCode=null;
      child.kill=()=>{child.exitCode=0;queueMicrotask(()=>child.emit('exit',0,'SIGTERM'));return true};
      queueMicrotask(()=>child.emit('message',{kind:'novora-ready',version:require('../src/version-label').VERSION}));
      return child;
    }});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(supervisor.isReady(),true);
    const result=await supervisor.poll();
    assert.equal(result,false);
    assert.equal(launched,1,'no replacement worker must be launched');
    const status=JSON.parse(fs.readFileSync(path.join(s.root,'data/update-status.json'),'utf8'));
    assert.equal(status.manualRecoveryRequired,true);
    assert.match(status.error,/KRITISCH/);
    recoveryPath=status.error.match(/Sicherung: (\/[^;\n]+)/)?.[1];
    assert.ok(recoveryPath&&fs.existsSync(recoveryPath));
    restore();
  }finally{
    supervisor?.shutdown();
    fs.copyFileSync=originalCopy;global.fetch=originalFetch;
    Module._load=originalLoad;updater.checkRelease=originalCheckRelease;
    if(originalEnv===undefined)delete process.env.NOVORA_AUTO_UPDATE;else process.env.NOVORA_AUTO_UPDATE=originalEnv;
    if(oldDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDir;
    if(recoveryPath)fs.rmSync(recoveryPath,{recursive:true,force:true});
    s.cleanup();
  }
});
