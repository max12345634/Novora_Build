'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const gate=require('../scripts/ci-release-gate');
const updater=require('../src/updater');

function signedManifest(version){
  const payload={schema:1,version,files:[]};
  // Tests use the project fixture key path only through the updater's existing
  // validation boundary; a known-good live-shape fixture is supplied by the
  // caller where signature validation is relevant.
  return payload;
}

test('CI release gate requires one matching version and bounded release notes',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-ci-gate-'));
  try{
    fs.mkdirSync(path.join(dir,'src'));fs.mkdirSync(path.join(dir,'release-notes'));
    fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({version:'4.18.3'}));
    fs.writeFileSync(path.join(dir,'src','version-label.js'),"module.exports={VERSION:'4.18.3'};\n");
    fs.writeFileSync(path.join(dir,'release-notes','4.18.3.md'),'Sichere GitHub-Veröffentlichung.\n');
    const value=gate.localRelease(dir);
    assert.equal(value.version,'4.18.3');
    fs.writeFileSync(path.join(dir,'src','version-label.js'),"module.exports={VERSION:'4.18.2'};\n");
    assert.throws(()=>gate.localRelease(dir),/unterschiedliche Versionen/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('CI release gate rejects downgrade and skips an identical live version',()=>{
  const original=updater.validateManifest;
  updater.validateManifest=()=>true;
  try{
    assert.deepEqual(gate.decideRelease({version:'4.18.2'},signedManifest('4.18.2')),{publish:false,reason:'already-live'});
    assert.deepEqual(gate.decideRelease({version:'4.18.3'},signedManifest('4.18.2')),{publish:true,reason:'new-version'});
    assert.throws(()=>gate.decideRelease({version:'4.18.1'},signedManifest('4.18.2')),/älter als Live/);
  }finally{updater.validateManifest=original}
});

test('CI release gate writes only non-secret control values',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-ci-output-'));
  try{
    const file=path.join(dir,'out');
    gate.writeOutputs({publish:true,version:'4.18.3',changelog:'release-notes/4.18.3.md',reason:'new-version'},file);
    assert.equal(fs.readFileSync(file,'utf8'),'publish=true\nversion=4.18.3\nchangelog=release-notes/4.18.3.md\nreason=new-version\n');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
