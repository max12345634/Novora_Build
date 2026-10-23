'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {history,BUILTIN}=require('../src/changelog');
test('changelog lists updates in newest-first order without private tokens',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nv33-history-'));
 try{const value=history(root);assert.equal(value.releases[0].version,require('../package.json').version);assert.ok(value.releases.length>=5);assert.equal(JSON.stringify(value).includes('DISCORD_TOKEN'),false)}finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('installed update history uses local data and is bounded',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nv33-history-'));
 try{fs.writeFileSync(path.join(root,'update-history.json'),JSON.stringify(Array.from({length:90},(_,i)=>({version:'3.3.'+i,time:Date.UTC(2026,9,22),from:'3.2.0'}))));
 const value=history(root);assert.equal(value.installed.length,50);assert.equal(value.installed[0].version,'3.3.89');}finally{fs.rmSync(root,{recursive:true,force:true})}
});
