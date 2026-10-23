'use strict';
// Security journal: append-only under normal operation, with SHA-256 hash chaining.
// This is tamper-evident, NOT WORM storage; hosting owners can delete local files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ID = /^\d{15,22}$/;
const SENSITIVE = [
  ['Administrator', 1n << 3n], ['ManageGuild', 1n << 5n],
  ['ManageRoles', 1n << 28n], ['ManageWebhooks', 1n << 29n],
  ['BanMembers', 1n << 2n], ['KickMembers', 1n << 1n],
  ['ManageChannels', 1n << 4n], ['ModerateMembers', 1n << 40n]
];
function dangerPermissions(before, after) {
  let a,b;
  try { a=BigInt(before??'0'); b=BigInt(after??'0'); } catch { return [] }
  return SENSITIVE.filter(([, flag]) => (a & flag) === 0n && (b & flag) !== 0n).map(([name])=>name);
}
function grantedPermissions(bits){return dangerPermissions('0',String(bits??'0'))}
function formatChange(change) {
  if (!change||typeof change.key!=='string') return null;
  // Do not store arbitrary strings, messages, or other personal data.
  if (change.key==='$add'||change.key==='$remove') {
    return { key:change.key,roles:(Array.isArray(change.new)?change.new:[]).slice(0,30)
      .map(x=>({id:String(x.id||''),name:String(x.name||'').slice(0,80)})).filter(x=>ID.test(x.id)) };
  }
  if (change.key==='permissions') return {key:'permissions',old:String(change.old??'0'),new:String(change.new??'0')};
  if (['name','hoist','mentionable','color','position','managed','administrator'].includes(change.key))
    return {key:change.key,old:String(change.old??'').slice(0,70),new:String(change.new??'').slice(0,70)};
  return null;
}
function classify(entry, roleMap=new Map()) {
  const action=Number(entry.action);
  const changes=(Array.isArray(entry.changes)?entry.changes:[]).map(formatChange).filter(Boolean);
  const targetId=String(entry.targetId??entry.target?.id??'');
  const executorId=String(entry.executorId??entry.executor?.id??'');
  const trustedReason=typeof entry.reason==='string'?entry.reason.slice(0,180):'';
  const initiatedBy=/^Novora Dashboard: (?:Discord-Bestätigung|Direktaktion) von (\d{15,22})$/.exec(trustedReason)?.[1]||null;
  let type=null,level='info',summary='',affectedRoles=[];
  const permissionChange=changes.find(x=>x.key==='permissions');
  const addedRights=permissionChange?dangerPermissions(permissionChange.old,permissionChange.new):[];
  const removedRights=permissionChange?dangerPermissions(permissionChange.new,permissionChange.old):[];
  if (action===25) {
    type='member_roles';
    const add=changes.find(x=>x.key==='$add')?.roles||[];
    const remove=changes.find(x=>x.key==='$remove')?.roles||[];
    affectedRoles=[...add.map(r=>({...r,operation:'add'})),...remove.map(r=>({...r,operation:'remove'}))];
    const special=affectedRoles.filter(r=>grantedPermissions(roleMap.get(r.id)?.permissions?.bitfield||roleMap.get(r.id)?.permissions||'0').length);
    level=special.length?'critical':'info';
    summary=`${add.length} Rolle(n) vergeben, ${remove.length} entfernt`;
  } else if ([30,31,32].includes(action)) {
    type=action===30?'role_create':action===31?'role_update':'role_delete';
    if (action===30) {
      const perms=changes.find(x=>x.key==='permissions');
      addedRights.push(...grantedPermissions(perms?.new||roleMap.get(targetId)?.permissions?.bitfield||'0'));
    }
    level=addedRights.length?'critical':removedRights.length||action===32?'warning':'info';
    summary=type==='role_create'?'Rolle erstellt':type==='role_delete'?'Rolle gelöscht':'Rolle bearbeitet';
  } else if ([1,10,11,12,13,14,15].includes(action)) {
    type=action===1?'guild_update':'channel_permissions';level='warning';summary='Server-/Kanal-Einstellungen geändert';
  } else if ([20,21,22,23].includes(action)) {
    type='moderation';level='warning';summary='Moderationsaktion';
  } else if ([50,51,52].includes(action)) {
    type='webhook';level='warning';summary='Webhook geändert';
  }
  if (!type) return null;
  if(addedRights.length){summary+=' · Gefährliche Berechtigung vergeben: '+[...new Set(addedRights)].join(', ');}
  if(removedRights.length){summary+=' · Berechtigung entfernt: '+[...new Set(removedRights)].join(', ');}
  return {id:String(entry.id||crypto.randomUUID()),guildId:String(entry.guild?.id||entry.guildId||''),action:type,
    actionCode:action,level,actorId:ID.test(executorId)?executorId:null,targetId:ID.test(targetId)?targetId:null,
    summary,affectedRoles,addedRights:[...new Set(addedRights)],removedRights:[...new Set(removedRights)],initiatedBy,changes,
    reason:trustedReason||null,
    createdAt:Date.now()};
}
function validGuild(id){ if(!ID.test(String(id||'')))throw Error('Invalid guild');return String(id); }
function makeAuditLedger(directory,{maxList=100}={}){
  const root=path.resolve(directory);fs.mkdirSync(root,{recursive:true,mode:0o700});
  const latest=new Map(), broken=new Map(), queue=new Map();
  function fileFor(guildId){return path.join(root,validGuild(guildId)+'.jsonl')}
  function walk(guildId,collect=false){
    const file=fileFor(guildId);let prev='0'.repeat(64),count=0,items=[];
    if(!fs.existsSync(file))return {ok:true,count,head:prev,items:[]};
    const data=fs.readFileSync(file,'utf8');
    if(data&&!data.endsWith('\n'))return {ok:false,count,head:prev,error:'Incomplete line'};
    for(const line of data.split('\n').filter(Boolean)){
      let record;try{record=JSON.parse(line)}catch{return {ok:false,count,head:prev,error:'Malformed log line'}}
      const payload=JSON.stringify(record.event);
      const hash=crypto.createHash('sha256').update(prev+'\n'+payload).digest('hex');
      if(record.previous!==prev||record.hash!==hash||!record.event||record.event.guildId!==guildId)
        return {ok:false,count,head:prev,error:'Hash chain modified near #'+(count+1)};
      prev=hash;count++;
      if(collect) {items.push(record.event);if(items.length>maxList)items.shift()}
    }
    return {ok:true,count,head:prev,items};
  }
  function status(guildId){
    const gid=validGuild(guildId);const result=walk(gid,false);
    if(!result.ok)broken.set(gid,result.error);else{latest.set(gid,{count:result.count,head:result.head});broken.delete(gid)}
    return result;
  }
  async function append(event){
    const gid=validGuild(event.guildId);
    const previousWork=queue.get(gid)||Promise.resolve();
    const work=previousWork.then(async()=>{
      if(broken.has(gid))throw Error('Security journal integrity issue: '+broken.get(gid));
      // Verify the existing journal before each append; never continue a tampered chain.
      const verified=status(gid);if(!verified.ok)throw Error(verified.error);
      const state=latest.get(gid);
      const clean={...event,guildId:gid,createdAt: Number(event.createdAt)||Date.now()};
      const payload=JSON.stringify(clean),hash=crypto.createHash('sha256').update(state.head+'\n'+payload).digest('hex');
      const row=JSON.stringify({previous:state.head,hash,event:clean})+'\n';
      await fs.promises.appendFile(fileFor(gid),row,{encoding:'utf8',mode:0o600});
      latest.set(gid,{head:hash,count:state.count+1});return {count:state.count+1,hash,event:clean};
    });
    queue.set(gid,work.catch(()=>{}));return work;
  }
  function list(guildId,{level,action,limit=40}={}){
    const result=walk(validGuild(guildId),true);if(!result.ok)return result;
    const allowed=['info','warning','critical'];
    let items=result.items;
    if(level&&allowed.includes(level))items=items.filter(e=>e.level===level);
    if(action)items=items.filter(e=>e.action===action);
    return {...result,items:items.reverse().slice(0,Math.min(Math.max(Number(limit)||40,1),100))};
  }
  function exportText(guildId){const result=walk(validGuild(guildId),false);if(!result.ok)throw Error(result.error);return fs.existsSync(fileFor(guildId))?fs.readFileSync(fileFor(guildId)) : Buffer.from('')}
  return {append,list,status,exportText,classify};
}
module.exports={makeAuditLedger,classify,dangerPermissions,grantedPermissions,formatChange};
