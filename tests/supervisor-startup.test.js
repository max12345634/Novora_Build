'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'..');
test('new supervisor entrypoint loads actual worker imports from src without src/src bug',()=>{
  const main=fs.readFileSync(path.join(root,'src/bot-main.js'),'utf8');
  const imports=[...main.matchAll(/require\('\.\/(.*?)'\)/g)].map(x=>x[1]);
  assert.ok(imports.length>=11);
  for(const dep of imports){
    if(dep.includes('/'))assert.ok(fs.existsSync(path.join(root,'src',dep+'.js')),'missing '+dep);
    else assert.ok(fs.existsSync(path.join(root,'src',dep+'.js'))||['dotenv','discord.js','node:path','node:timers/promises'].includes(dep),'missing '+dep);
  }
  assert.ok(!main.includes("require('./src/"));
  assert.match(fs.readFileSync(path.join(root,'index.js'),'utf8'),/supervisor/);
});
test('supervisor loads BotHosting .env before reading update settings',()=>{
  const main=fs.readFileSync(path.join(root,'src/supervisor.js'),'utf8');
  assert.ok(main.indexOf("require('dotenv').config()")>0);
  assert.ok(main.indexOf("require('dotenv').config()")<main.indexOf("process.env.NOVORA_AUTO_UPDATE"));
});
