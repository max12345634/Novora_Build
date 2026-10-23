'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {makeAuditLedger,classify,dangerPermissions}=require('../src/audit-ledger');
const {makeSecurityCenter}=require('../src/security-center');
const G='123456789012345678', A='234567890123456789', U='345678901234567890', R='456789012345678901';
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'nv32-audit-'))}
test('critical detection for new Administrator, Manage Roles and Webhooks permissions',()=>{
  assert.deepEqual(dangerPermissions('0','8'),['Administrator']);
  assert.ok(dangerPermissions('0',String((1n<<28n)|(1n<<29n))).includes('ManageRoles'));
  assert.ok(dangerPermissions('0',String(1n<<29n)).includes('ManageWebhooks'));
  assert.deepEqual(dangerPermissions(String(1n<<3n),String(1n<<3n)),[]);
});
test('member role grant records actor, target, role name and critical role flag',()=>{
  const roles=new Map([[R,{permissions:{bitfield:8n}}]]);
  const event=classify({id:'777777777777777777',action:25,guildId:G,executorId:A,targetId:U,changes:[{key:'$add',new:[{id:R,name:'Superadmin'}]}]},roles);
  assert.equal(event.action,'member_roles');assert.equal(event.actorId,A);assert.equal(event.targetId,U);
  assert.equal(event.level,'critical');assert.deepEqual(event.affectedRoles[0],{id:R,name:'Superadmin',operation:'add'});
});
test('permission change audit records exact newly granted dangerous flags',()=>{
  const event=classify({id:'888888888888888888',action:31,guildId:G,executorId:A,targetId:R,changes:[{key:'permissions',old:'0',new:String((1n<<3n)|(1n<<28n))}]});
  assert.equal(event.level,'critical');assert.deepEqual(event.addedRights,['Administrator','ManageRoles']);
  assert.equal(classify({id:'x',action:999,guildId:G}),null);
});
test('local journal is SHA-256 chained and append-only by normal code path',async()=>{
  const dir=temp();try{
    const ledger=makeAuditLedger(dir);const events=Array.from({length:7},(_,i)=>({id:'audit'+i,guildId:G,level:i===0?'critical':'info',action:'member_roles',summary:'Rolle vergeben #'+i}));
    await Promise.all(events.map(e=>ledger.append(e)));
    const check=ledger.status(G);assert.equal(check.ok,true);assert.equal(check.count,7);
    const list=ledger.list(G,{level:'critical'});assert.equal(list.items.length,1);
    assert.ok(/^[a-f0-9]{64}$/.test(check.head));
    const exported=ledger.exportText(G);assert.equal(exported.toString().split('\n').filter(Boolean).length,7);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('tampering or truncating local journal is detected and future appends fail closed',async()=>{
  const dir=temp();try{
    const journal=makeAuditLedger(dir);await journal.append({guildId:G,action:'role_update',summary:'Safe'});
    const file=path.join(dir,G+'.jsonl');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Safe','Hacked'));
    assert.equal(journal.status(G).ok,false);
    await assert.rejects(journal.append({guildId:G,action:'role_update',summary:'Next'}),/integrity/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('security event persists even when Discord log channel is not set',async()=>{
  const dir=temp();try{
    const roles={cache:new Map([[R,{permissions:{bitfield:8n}}]])};
    const guild={id:G,roles,channels:{fetch:async()=>null}};
    const client={guilds:{cache:new Map([[G,guild]])}};
    const center=makeSecurityCenter({client,store:{state:{guilds:{[G]:{}}}},dataDir:dir});
    await center.onEntry({id:'777777777777777777',action:25,guildId:G,executorId:A,targetId:U,changes:[{key:'$add',new:[{id:R,name:'Admin'}]}]},guild);
    const status=center.ledger.status(G);assert.equal(status.ok,true);assert.equal(status.count,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('cross-guild journal read requires VIEW_AUDIT_LOG of that guild',async()=>{
  const dir=temp();try{
    const guild={id:G,members:{fetch:async(id)=>({permissions:{has:()=>id===A}})}};
    const client={guilds:{cache:new Map([[G,guild]])}};
    const center=makeSecurityCenter({client,store:{state:{guilds:{[G]:{}}}},dataDir:dir});
    await assert.rejects(center.list(G,U),/Audit-Log/);
    assert.equal((await center.list(G,A)).ok,true);
    await assert.rejects(center.list('111111111111111111',A),/Bot ist nicht/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('API-triggered role changes distinguish the acting bot from the human approver',()=>{
  const event=classify({id:'919191919191919191',action:25,guildId:G,executorId:U,targetId:U,
    reason:'Novora Dashboard: Discord-Bestätigung von '+A,changes:[{key:'$remove',new:[{id:R,name:'Bürger'}]}]});
  assert.equal(event.actorId,U);
  assert.equal(event.initiatedBy,A);
  assert.equal(event.affectedRoles[0].operation,'remove');
});

test('removing Administrator rights is logged as a warning, not silently ignored',()=>{
 const event=classify({id:'888888888888888888',action:31,guildId:G,executorId:A,targetId:R,changes:[{key:'permissions',old:'8',new:'0'}]});
 assert.equal(event.level,'warning');assert.deepEqual(event.removedRights,['Administrator']);
});
