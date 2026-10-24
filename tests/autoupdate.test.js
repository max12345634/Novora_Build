'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const updater=require('../src/updater');
const {compareVersions}=require('../src/version');
const fixture=path.join(__dirname,'fixtures');
const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'latest.json'),'utf8'));
const content=fs.readFileSync(path.join(fixture,'version-label.js.txt'));

test('manifest is cryptographically signed and versioned',()=>{
  assert.equal(updater.validateManifest(manifest).version,'3.1.1');
  assert.equal(compareVersions('3.1.1','3.1.0'),1);
  assert.equal(compareVersions('3.1.0','3.1.0'),0);
  assert.equal(compareVersions('3.1.0','3.1.1'),-1);
});
test('manifest tampering and unsafe target paths fail closed',()=>{
  assert.throws(()=>updater.validateManifest({...manifest,version:'3.1.2'}),/Signatur/);
  assert.throws(()=>updater.validateManifest({...manifest,files:[{...manifest.files[0],path:'data/state.json'}]}),/Unsichere/);
  assert.throws(()=>updater.validateManifest({...manifest,files:[{...manifest.files[0],path:'../index.js'}]}),/Unsichere/);
  assert.throws(()=>updater.validateManifest({...manifest,files:[{...manifest.files[0],url:'https://evil.example/update.js'}]}),/Unsichere/);
  assert.equal(updater.safePath('src/updater.js'),false);
  assert.equal(updater.safePath('src/supervisor.js'),false);
  assert.equal(updater.safePath('src/control.js'),true);
});
test('website hostname is pinned over HTTPS',()=>{
  const old=process.env.NOVORA_RELEASE_BASE_URL;
  process.env.NOVORA_RELEASE_BASE_URL='https://attacker.example';
  assert.throws(()=>updater.releaseOrigin(),/offizielle/);
  process.env.NOVORA_RELEASE_BASE_URL='http://api-v2.appdeploy.ai/app/novora-verify-control-center-ae02zt/api';
  assert.throws(()=>updater.releaseOrigin(),/offizielle/);
  if(old===undefined)delete process.env.NOVORA_RELEASE_BASE_URL;else process.env.NOVORA_RELEASE_BASE_URL=old;
});
test('download validates content digest and never changes state before commit',async()=>{
  const old=global.fetch; const hit=[];
  global.fetch=async(url)=>{
    hit.push(String(url));
    if(String(url).endsWith('/latest.json'))return new Response(JSON.stringify(manifest),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).endsWith('/version-label.js.txt'))return new Response(content,{status:200,headers:{'content-type':'application/octet-stream'}});
    return new Response('bad',{status:404});
  };
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'novora-updatetest-'));
  try{
    fs.mkdirSync(path.join(d,'src'));
    const file=path.join(d,'src/version-label.js');fs.writeFileSync(file,"'use strict';module.exports={VERSION:'3.1.0'};\n");
    fs.mkdirSync(path.join(d,'data'));fs.writeFileSync(path.join(d,'data/state.json'),'important user data');
    const release=await updater.checkRelease(d,'3.1.0');assert.equal(release.manifest.version,'3.1.1');
    const installed=updater.backupAndInstall(d,release);
    assert.equal(fs.readFileSync(file,'utf8'),content.toString('utf8'));
    assert.equal(fs.readFileSync(path.join(d,'data/state.json'),'utf8'),'important user data');
    installed.rollback();
    assert.match(fs.readFileSync(file,'utf8'),/3\.1\.0/);
    const replay=await updater.checkRelease(d,'3.1.1');assert.equal(replay,null);
    fs.rmSync(release.dir,{recursive:true,force:true});assert.equal(hit.length,3);
  }finally{global.fetch=old;fs.rmSync(d,{recursive:true,force:true});}
});
test('bad signed manifest payload cannot overwrite files',async()=>{
  const old=global.fetch;
  global.fetch=async(url)=>String(url).endsWith('latest.json')?new Response(JSON.stringify(manifest),{headers:{'content-type':'application/json'}}) : new Response(Buffer.from('malicious code'),{headers:{'content-type':'application/octet-stream'}});
  try{await assert.rejects(()=>updater.checkRelease(os.tmpdir(),'3.1.0'),/Prüfsumme/)}finally{global.fetch=old}
});

test('maliciously oversized HTTP release is aborted before buffering the full body',async()=>{
  const old=global.fetch;
  global.fetch=async()=>new Response('x'.repeat(20000),{status:200});
  try{await assert.rejects(()=>updater.fetchText('https://test.invalid',64),/groß/)}
  finally{global.fetch=old}
});
