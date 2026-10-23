'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {checkRelease,backupAndInstall}=require('../src/updater');
const fixture=path.join(__dirname,'../appdeploy-release/public/novora-releases');
// If release assets are not in the bot's normal package, the test is skipped.
test('signed V3.2 release updates V3.1 JS worker files and rolls back safely',async t=>{
  if(!fs.existsSync(fixture)){t.skip('release feed not bundled into production bot');return}
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'novora-release32-'));
  const oldFetch=global.fetch,oldWebsite=process.env.WEBSITE_URL;
  try{
    fs.mkdirSync(path.join(root,'src'),{recursive:true});
    fs.writeFileSync(path.join(root,'src/version-label.js'),"module.exports={VERSION:'3.1.0'};\n");
    global.fetch=async url=>{
      const leaf=new URL(String(url)).pathname.split('/').pop();
      const buf=fs.readFileSync(path.join(fixture,leaf));
      return new Response(buf,{status:200,headers:{'content-length':String(buf.length)}});
    };
    process.env.WEBSITE_URL='https://novora-verify-control-center-ae02zt.v2.appdeploy.ai';
    const rel=await checkRelease(root,'3.1.0');
    assert.equal(rel.manifest.version,'3.2.0');assert.equal(rel.manifest.files.length,9);
    const rec=backupAndInstall(root,rel);
    assert.match(fs.readFileSync(path.join(root,'src/version-label.js'),'utf8'),/3\.2\.0/);
    assert.ok(fs.existsSync(path.join(root,'src/security-center.js')));
    rec.rollback();
    assert.match(fs.readFileSync(path.join(root,'src/version-label.js'),'utf8'),/3\.1\.0/);
    assert.equal(fs.existsSync(path.join(root,'src/security-center.js')),false);
    fs.rmSync(rel.dir,{recursive:true,force:true});
  }finally{
    global.fetch=oldFetch;
    if(oldWebsite===undefined)delete process.env.WEBSITE_URL;else process.env.WEBSITE_URL=oldWebsite;
    fs.rmSync(root,{recursive:true,force:true});
  }
});
