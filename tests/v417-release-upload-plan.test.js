'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {prepare}=require('../scripts/prepare-release-upload');
test('fehlender Release-Ordner wird nicht zur Veröffentlichung freigegeben',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-empty-'));
 try{assert.throws(()=>prepare(dir))}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('ungültiges oder unsigniertes Manifest wird abgelehnt',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-unsigned-'));
 try{fs.mkdirSync(path.join(dir,'novora-releases'));fs.writeFileSync(path.join(dir,'novora-releases/latest.json'),JSON.stringify({schema:1,version:'4.18.0',files:[],signature:''}));assert.throws(()=>prepare(dir))}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
