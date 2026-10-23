'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {verifyReleaseOutput}=require('../scripts/verify-release-output');
const root=path.resolve(__dirname,'..');
const fixture=path.join(__dirname,'fixtures/release-v35/public');
function copyFixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-publish-test-'));fs.cpSync(fixture,dir,{recursive:true});return dir}
function cleanup(dir){fs.rmSync(dir,{recursive:true,force:true})}
test('V4.17: valid historical signed release passes offline publication verification',()=>{
  const dir=copyFixture();try{const result=verifyReleaseOutput(dir);assert.equal(result.version,'3.5.0');assert.ok(result.files>20)}finally{cleanup(dir)}
});
test('V4.17: a modified release file fails SHA-256 verification',()=>{
  const dir=copyFixture();try{
    const m=JSON.parse(fs.readFileSync(path.join(dir,'novora-releases/latest.json')));
    const target=path.join(dir,m.files[0].url.substring(1));
    fs.appendFileSync(target,'\n// tampered');
    assert.throws(()=>verifyReleaseOutput(dir),/Dateigröße|SHA-256/);
  }finally{cleanup(dir)}
});
test('V4.17: a forged signature fails verification',()=>{
  const dir=copyFixture();try{
    const file=path.join(dir,'novora-releases/latest.json');const m=JSON.parse(fs.readFileSync(file));m.signature='A'.repeat(88);fs.writeFileSync(file,JSON.stringify(m));
    assert.throws(()=>verifyReleaseOutput(dir),/Signatur/);
  }finally{cleanup(dir)}
});
test('V4.17: a symlink to an external release file is refused',()=>{
  const dir=copyFixture();try{
    const m=JSON.parse(fs.readFileSync(path.join(dir,'novora-releases/latest.json')));
    const target=path.join(dir,m.files[0].url.substring(1));const outside=path.join(dir,'outside');fs.copyFileSync(target,outside);fs.unlinkSync(target);fs.symlinkSync(outside,target);
    assert.throws(()=>verifyReleaseOutput(dir),/Symlink/);
  }finally{cleanup(dir)}
});
test('V4.17: builder fails closed without signing key',()=>{
  const env={...process.env};delete env.NOVORA_SIGNING_KEY_FILE;
  assert.throws(()=>execFileSync(process.execPath,['scripts/build-signed-release.js','4.18.0'],{cwd:root,env,stdio:'pipe'}),/Command failed/);
});
test('V4.17: builder rejects manifest version inconsistent with installed code',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-key-test-'));
  try{
    const {privateKey}=require('node:crypto').generateKeyPairSync('ed25519');const key=path.join(dir,'key.pem');fs.writeFileSync(key,privateKey.export({format:'pem',type:'pkcs8'}));
    const env={...process.env,NOVORA_SIGNING_KEY_FILE:key};
    let err;
    try{execFileSync(process.execPath,['scripts/build-signed-release.js','4.18.0',path.join(dir,'release')],{cwd:root,env,stdio:'pipe'})}catch(e){err=e}
    assert.ok(err);assert.match(String(err.stderr),/Release-Version stimmt nicht/);assert.equal(fs.existsSync(path.join(dir,'release')),false);
  }finally{cleanup(dir)}
});

test('V4.17: publication verifier rejects duplicate hosted URLs even with an otherwise valid signature',()=>{
  // A genuine signature cannot be altered in a test; inject a narrowly scoped
  // manifest-validation stub before loading the verifier in an isolated process.
  const script=String.raw`const fs=require('node:fs');const path=require('node:path');const updater=require('./src/updater');updater.validateManifest=()=>({});const verify=require('./scripts/verify-release-output').verifyReleaseOutput;const dir=process.argv[1];const file=path.join(dir,'novora-releases/latest.json');const manifest=JSON.parse(fs.readFileSync(file));manifest.files[1].url=manifest.files[0].url;fs.writeFileSync(file,JSON.stringify(manifest));try{verify(dir);process.exit(1)}catch(e){if(!/Doppelte Release-URL/.test(e.message))throw e}`;
  const dir=copyFixture();try{execFileSync(process.execPath,['-e',script,dir],{cwd:root,stdio:'pipe'});}finally{cleanup(dir)}
});
