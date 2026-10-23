'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {validateManifest,checkRelease,backupAndInstall}=require('../src/updater');
const feed=path.join(__dirname,'./fixtures/release-v35/public/novora-releases');
test('V3.5 release signed with updater key, contains partnership AI and embedded emoji files',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(feed,'latest.json'),'utf8'));
 assert.equal(validateManifest(manifest).version,'3.5.0');
 for(const file of ['src/partnerships.js','src/partnership-analysis.js','src/partner-art-v35.js','src/partner-art.js','src/bot-main.js','src/version-label.js'])
  assert.ok(manifest.files.some(f=>f.path===file),file);
 assert.ok(manifest.files.every(f=>f.path.startsWith('src/')&&!f.path.includes('updater')&&!f.path.includes('supervisor')));
});
test('V3.5 signed update from V3.3 restores files on rollback and never changes data/',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora35-release-'));const oldFetch=global.fetch,oldURL=process.env.WEBSITE_URL;
 try{
  fs.mkdirSync(path.join(dir,'src'),{recursive:true});fs.mkdirSync(path.join(dir,'data'),{recursive:true});
  fs.writeFileSync(path.join(dir,'data/state.json'),'SAVED_DATA');
  fs.writeFileSync(path.join(dir,'src/version-label.js'),"module.exports={VERSION:'3.3.0'};\n");
  global.fetch=async url=>{const b=fs.readFileSync(path.join(feed,String(url).split('/').pop()));return new Response(b,{status:200,headers:{'content-length':String(b.length)}})};
  process.env.WEBSITE_URL='https://novora-verify-control-center-ae02zt.v2.appdeploy.ai';
  const rel=await checkRelease(dir,'3.3.0');assert.ok(rel);const tx=backupAndInstall(dir,rel);
  assert.ok(fs.existsSync(path.join(dir,'src/partnerships.js')));assert.ok(fs.existsSync(path.join(dir,'src/partnership-analysis.js')));
  assert.equal(fs.readFileSync(path.join(dir,'data/state.json'),'utf8'),'SAVED_DATA');
  tx.rollback();assert.equal(fs.readFileSync(path.join(dir,'data/state.json'),'utf8'),'SAVED_DATA');
  assert.equal(fs.existsSync(path.join(dir,'src/partnership-analysis.js')),false);
  assert.match(fs.readFileSync(path.join(dir,'src/version-label.js'),'utf8'),/3.3.0/);
  fs.rmSync(rel.dir,{recursive:true,force:true});
 }finally{global.fetch=oldFetch;if(oldURL===undefined)delete process.env.WEBSITE_URL;else process.env.WEBSITE_URL=oldURL;fs.rmSync(dir,{recursive:true,force:true})}
});
