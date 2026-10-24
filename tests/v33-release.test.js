'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {checkRelease,backupAndInstall,validateManifest}=require('../src/updater');
const rootFiles=path.join(__dirname,'./fixtures/release-v33/public/novora-releases');
test('V3.3 signed feed is compatible with pinned updater, safely installs and rolls back',async()=>{
  assert.ok(fs.existsSync(rootFiles));
  const manifest=JSON.parse(fs.readFileSync(path.join(rootFiles,'latest.json'),'utf8'));
  assert.equal(manifest.version,'3.3.0');
  assert.equal(validateManifest(manifest).version,'3.3.0');
  assert.equal(manifest.files.some(f=>f.path==='src/supervisor.js'),false,'auto updater cannot update its own supervisor');
  assert.equal(manifest.files.some(f=>f.path==='src/owner-alerts.js'),true);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'novora33-release-'));
  const oldFetch=global.fetch,oldWeb=process.env.WEBSITE_URL;
  try{
    fs.mkdirSync(path.join(temp,'src'),{recursive:true});
    fs.writeFileSync(path.join(temp,'src/version-label.js'),"module.exports={VERSION:'3.2.0'};\n");
    global.fetch=async url=>{
      const file=String(url).split('/').pop();const body=fs.readFileSync(path.join(rootFiles,file));
      return new Response(body,{status:200,headers:{'content-length':String(body.length),'content-type':String(url).endsWith('latest.json')?'application/json':'application/octet-stream'}});
    };
    process.env.WEBSITE_URL='https://novora-verify-control-center-ae02zt.v2.appdeploy.ai';
    const release=await checkRelease(temp,'3.2.0');
    assert.equal(release.manifest.version,'3.3.0');
    const rec=backupAndInstall(temp,release);
    assert.match(fs.readFileSync(path.join(temp,'src/version-label.js'),'utf8'),/3.3.0/);
    assert.ok(fs.existsSync(path.join(temp,'src/owner-alerts.js')));
    rec.rollback();assert.match(fs.readFileSync(path.join(temp,'src/version-label.js'),'utf8'),/3.2.0/);
    assert.equal(fs.existsSync(path.join(temp,'src/owner-alerts.js')),false);
    fs.rmSync(release.dir,{recursive:true,force:true});
  }finally{
    global.fetch=oldFetch;
    if(oldWeb===undefined)delete process.env.WEBSITE_URL;else process.env.WEBSITE_URL=oldWeb;
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
