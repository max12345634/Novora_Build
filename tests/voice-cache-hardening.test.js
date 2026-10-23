'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {isUsableAudio}=require('../src/voice-cache');
test('voice cache rejects absent and empty files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-voice-'));
 try{
  const file=path.join(dir,'intro.ogg');
  assert.equal(isUsableAudio(file),false);
  fs.writeFileSync(file,Buffer.alloc(0));assert.equal(isUsableAudio(file),false);
  fs.writeFileSync(file,Buffer.alloc(63));assert.equal(isUsableAudio(file),false);
  fs.writeFileSync(file,Buffer.alloc(64));assert.equal(isUsableAudio(file),true);
  assert.equal(isUsableAudio(dir),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
