'use strict';
// Novora 2.0: strictly validated, instantly applied Discord-server configuration.
const HEX=/^#[0-9a-fA-F]{6}$/;
const VERSION=require('./version-label').VERSION;
function defaults(record={}) {
  return {
    panelTitle: typeof record.panelTitle==='string' ? record.panelTitle : 'Verifizierung',
    panelDescription: typeof record.panelDescription==='string' ? record.panelDescription : '',
    panelColor: HEX.test(record.panelColor||'') ? record.panelColor : '#6477ed',
    verifyButtonLabel: typeof record.verifyButtonLabel==='string'?record.verifyButtonLabel:'Mit Discord autorisieren',
    showOauth: true,
    verificationPaused: record.verificationPaused===true,
    allowTransfer:record.allowTransfer===true,
    roleId:record.roleId||null,
    removeRoleId:record.removeRoleId||null
  };
}
function validatePatch(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Ungültige Einstellungen');
  const allowed=new Set(['panelTitle','panelDescription','panelColor','verifyButtonLabel','showOauth','allowTransfer','verificationPaused']);
  const patch={};
  for (const [name,raw] of Object.entries(value)) {
    if(!allowed.has(name))throw new Error('Unbekannte Einstellung: '+name);
    if(name==='showOauth'||name==='allowTransfer'||name==='verificationPaused') {
      if(typeof raw!=='boolean')throw new Error(name+' muss true oder false sein');
      patch[name]=raw;
    }else if(name==='panelColor') {
      if(typeof raw!=='string'||!HEX.test(raw))throw new Error('Farbe benötigt #RRGGBB');
      patch[name]=raw.toLowerCase();
    }else{
      const max={panelTitle:90,panelDescription:1200,verifyButtonLabel:65}[name];
      if(typeof raw!=='string'||raw.length>max||(name==='panelDescription'?/[\u0000-\u0009\u000b-\u001f]/.test(raw):/[\u0000-\u001f]/.test(raw)))throw new Error('Ungültiger Text für '+name);
      if(name!=='panelDescription' && raw.trim().length<2)throw new Error(name+' darf nicht leer sein');
      patch[name]=raw.trim();
    }
  }
  if(!Object.keys(patch).length)throw new Error('Keine Einstellungen zum Speichern');
  return patch;
}
function recordAudit(store, entry){
  const e={id:require('node:crypto').randomUUID(),time:Date.now(),guildId:String(entry.guildId||''),action:String(entry.action||'').slice(0,70),actorId:String(entry.actorId||'').slice(0,24),details:String(entry.details||'').slice(0,160)};
  const audit=store.state.audit||(store.state.audit=[]);
  audit.unshift(e);if(audit.length>500)audit.length=500;
  return e;
}
function stats(state,guildId){
  const members=Object.values(state.members||{}).filter(m=>!guildId||(m.verifiedGuildIds||[]).includes(guildId));
  const count=members.reduce((sum,m)=>sum+(guildId ? Number(m.counts?.[guildId]||0) : Object.values(m.counts||{}).reduce((a,b)=>a+Number(b||0),0)),0);
  const verifiedLastWeek=members.filter(m=>Number(m.verifiedAt||0)>Date.now()-7*86400000).length;
  const consent=members.filter(m=> guildId ? m.transfer?.allowedTargets?.includes(guildId) : (m.transfer?.scopes||[]).includes('guilds.join')).length;
  return {verifiedMembers:members.length,verifiedLastWeek,messages:count,oauthConsents:consent,events:(state.audit||[]).filter(e=>!guildId||e.guildId===guildId).length};
}
module.exports={VERSION,defaults,validatePatch,recordAudit,stats};
