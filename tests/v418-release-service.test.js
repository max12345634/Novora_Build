'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const updater=require('../src/updater');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/latest.json'),'utf8'));

test('V4.18: empty feed is a clean no-update state',async()=>{
  const old=global.fetch;global.fetch=async()=>new Response(JSON.stringify({schema:1,status:'empty'}),{headers:{'content-type':'application/json'}});
  try{assert.equal(await updater.checkRelease(os.tmpdir(),'4.18.0'),null)}finally{global.fetch=old}
});
for(const [status,code] of [[404,'FEED_NOT_CONFIGURED'],[403,'ACCESS_DENIED'],[500,'SERVER_ERROR']]){
  test('V4.18: HTTP '+status+' has distinct feed error',async()=>{
    const old=global.fetch;global.fetch=async()=>new Response('failed',{status});
    try{await assert.rejects(()=>updater.checkRelease(os.tmpdir(),'4.18.0'),e=>e.code===code&&e.status===status)}finally{global.fetch=old}
  });
}
test('V4.18: aborted release body is rejected',async()=>{
  const old=global.fetch;global.fetch=async()=>{const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));c.error(new Error('connection lost'))}});return new Response(stream,{headers:{'content-type':'application/json'}})};
  try{await assert.rejects(()=>updater.checkRelease(os.tmpdir(),'4.18.0'),/connection lost/)}finally{global.fetch=old}
});
test('V4.18: wrong manifest content type is rejected',async()=>{
  const old=global.fetch;global.fetch=async()=>new Response(JSON.stringify(manifest),{headers:{'content-type':'text/html'}});
  try{await assert.rejects(()=>updater.checkRelease(os.tmpdir(),'3.1.0'),/Content-Type/)}finally{global.fetch=old}
});
test('V4.18: insufficient disk space fails before installation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'novora-space-'));
  try{fs.mkdirSync(path.join(root,'data'));assert.throws(()=>updater.ensureDiskSpace(root,manifest,()=>({bavail:0,bsize:4096})),e=>e.code==='NO_SPACE')}
  finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('V4.18: duplicate signed download URLs are rejected',()=>{
  const files=manifest.files.length>1?[manifest.files[0],{...manifest.files[1],url:manifest.files[0].url}]:[manifest.files[0],{...manifest.files[0],path:'src/control.js'}];
  assert.throws(()=>updater.validateManifest({...manifest,files}),/Unsichere/);
});
