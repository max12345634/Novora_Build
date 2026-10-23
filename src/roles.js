'use strict';
const crypto = require('node:crypto');
const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const SNOWFLAKE = /^\d{17,22}$/;
const ACTIONS = new Set(['add', 'remove']);
const TTL = 10 * 60 * 1000;

function makeRoleAdministration({ client, store }) {
  const grants = new Map();
  const requests = new Map();
  const statusCache = new Map();
  function err(code, message) { return { status: code, body: { error: message } }; }
  async function administrator(guildId, userId) {
    if (!SNOWFLAKE.test(String(guildId)) || !SNOWFLAKE.test(String(userId))) throw new Error('Ungültige Discord-ID');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Dieser Server ist nicht mit dem Bot verbunden');
    const actor = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
    if (!actor || (guild.ownerId !== userId && !actor.permissions.has(PermissionsBitField.Flags.Administrator)))
      throw new Error('Du brauchst Administratorrechte auf genau diesem Server');
    return { guild, actor };
  }
  function cleanup() {
    const now = Date.now();
    for (const [key, value] of grants) if (value.until < now) grants.delete(key);
    for (const [key, value] of requests) if (value.until + TTL < now) requests.delete(key);
    for (const [key, value] of statusCache) if (value.until < now) statusCache.delete(key);
  }
  async function issueGuildCode(guildId, adminId) {
    await administrator(guildId, adminId);
    cleanup();
    for (const [key, value] of grants) if (value.adminId === adminId && value.guildId === guildId) grants.delete(key);
    const code = String(crypto.randomInt(10000000, 100000000));
    grants.set(crypto.createHash('sha256').update(code).digest('hex'), { guildId, adminId, until: Date.now()+TTL });
    return code;
  }
  async function claimGuildCode(guildId, code) {
    cleanup();
    if (!SNOWFLAKE.test(String(guildId)) || !/^\d{8}$/.test(String(code))) return err(400, 'Bitte Server und den 8-stelligen Discord-Code prüfen.');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const issued = grants.get(hash);
    if (!issued || issued.guildId !== guildId) return err(403, 'Code ungültig oder abgelaufen. /dashboard-rollen erneut ausführen.');
    grants.delete(hash);
    try { await administrator(guildId, issued.adminId); }
    catch (e) { return err(403, e.message); }
    return { status:200, body:{ok:true,guildId,adminId:issued.adminId} };
  }
  async function validateTarget(guildId, adminId, targetId, roleId) {
    const { guild, actor } = await administrator(guildId, adminId);
    if (!SNOWFLAKE.test(String(targetId)) || !SNOWFLAKE.test(String(roleId))) throw new Error('Ungültige Mitglieds- oder Rollen-ID');
    const target = await guild.members.fetch({user:targetId,force:true}).catch(()=>null);
    if(!target) throw new Error('Dieses Mitglied ist auf dem Server nicht erreichbar');
    const me = await guild.members.fetchMe();
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) throw new Error('Dem Bot fehlt Rollen verwalten');
    const role = await guild.roles.fetch(roleId).catch(()=>null);
    if(!role || role.id === guild.id || role.managed) throw new Error('Diese Rolle kann nicht geändert werden');
    if(role.position >= me.roles.highest.position) throw new Error('Die Bot-Rolle muss über der Zielrolle stehen');
    if(guild.ownerId!==adminId && (role.position >= actor.roles.highest.position || (target.id !== actor.id && target.roles.highest.position >= actor.roles.highest.position)))
      throw new Error('Die Rolle oder das Zielmitglied steht zu hoch in deiner Rollenhierarchie');
    if(role.permissions.has(PermissionsBitField.Flags.Administrator) || role.permissions.has(PermissionsBitField.Flags.ManageRoles))
      throw new Error('Administrator- und Rollenverwaltungsrollen können nur direkt in Discord vergeben werden');
    return { guild, target, role };
  }
  async function catalog(guildId, userId, adminId) {
    try {
      const { guild, actor } = await administrator(guildId, adminId);
      const target = await guild.members.fetch({user:userId,force:true}).catch(()=>null);
      if(!target) return err(404,'Mitglied ist nicht auf diesem Server');
      const me = await guild.members.fetchMe();
      const roles = [...(await guild.roles.fetch()).values()]
        .filter(r=>r.id!==guild.id)
        .sort((a,b)=>b.position-a.position)
        .slice(0,180).map(role=>{
          const blocked = role.managed || role.position>=me.roles.highest.position ||
            (guild.ownerId!==adminId && (role.position>=actor.roles.highest.position || (target.id!==actor.id && target.roles.highest.position>=actor.roles.highest.position))) ||
            role.permissions.has(PermissionsBitField.Flags.Administrator) || role.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
            !me.permissions.has(PermissionsBitField.Flags.ManageRoles);
          return {id:role.id,name:role.name,hasRole:target.roles.cache.has(role.id),canEdit:!blocked,position:role.position,color:role.color||0,managed:!!role.managed,protected:!!blocked};
        });
      return {status:200,body:{guildId,userId,adminId,roles}};
    } catch(e) {return err(403,e.message)}
  }
  async function requestChange({guildId,adminId,userId,roleId,action}) {
    cleanup();
    if (!ACTIONS.has(action)) return err(400,'Nur Rollen hinzufügen oder entfernen ist erlaubt');
    let info;
    try { info=await validateTarget(guildId,adminId,userId,roleId); }
    catch(e){return err(403,e.message)}
    const already=info.target.roles.cache.has(roleId);
    if ((action==='add' && already)||(action==='remove' && !already)) return err(409,'Die Rolle hat bereits den gewünschten Zustand. Bitte Profil aktualisieren.');
    const requestId=crypto.randomUUID().replace(/-/g,'');
    // Direct, authorized dashboard action; no DM approval. Permissions and hierarchy were
    // checked above and are re-checked immediately before the Discord API mutation.
    const record={id:requestId,guildId,adminId,userId,roleId,action,until:Date.now()+60*60*1000,status:'processing',message:'Rollenänderung wird verarbeitet'};
    statusCache.set(requestId,record);
    try{
      const current=await validateTarget(guildId,adminId,userId,roleId);
      const nowHas=current.target.roles.cache.has(roleId);
      if((action==='add'&&nowHas)||(action==='remove'&&!nowHas))throw Error('Rolle wurde zwischenzeitlich bereits verändert');
      const reason='Novora Dashboard: Direktaktion von '+adminId;
      if(action==='add')await current.target.roles.add(current.role.id,reason);
      else await current.target.roles.remove(current.role.id,reason);
      record.status='completed';record.message='Rolle erfolgreich '+(action==='add'?'vergeben':'entfernt');
    }catch(e){record.status='failed';record.message=String(e.message).slice(0,170);}
    return {status:record.status==='completed'?200:422,body:{ok:record.status==='completed',requestId,status:record.status,message:record.message}};
  }
  function status({requestId,guildId,adminId}) {
    const item=requests.get(requestId)||statusCache.get(requestId);
    if(!item||item.guildId!==guildId||item.adminId!==adminId)return err(404,'Änderungsauftrag nicht gefunden');
    if(item.status==='pending'&&item.until<Date.now()){item.status='expired';item.message='Bestätigungszeit abgelaufen';requests.delete(requestId);statusCache.set(requestId,{...item,until:Date.now()+60*60*1000});}
    return {status:200,body:{status:item.status,message:item.message||'',requestId}};
  }
  async function onButton(interaction){
    return interaction.reply({content:'Diese alte Bestätigungsanfrage ist nicht mehr gültig. Rollenänderungen werden über das berechtigte Dashboard direkt durchgeführt.',ephemeral:true}).then(()=>true);
  }
  return {issueGuildCode,claimGuildCode,catalog,requestChange,status,onButton};
}
module.exports={makeRoleAdministration};
