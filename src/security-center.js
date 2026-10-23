'use strict';
const { makeAuditLedger, classify }=require('./audit-ledger');
const ID=/^\d{15,22}$/;
const SEVERITY={info:0,warning:1,critical:2};
function makeSecurityCenter({client,store,dataDir,ownerAlerts}){
  const ledger=makeAuditLedger(require('node:path').join(dataDir,'security-logs'));
  const recentlySeen=new Map();
  async function canRead(guildId,adminId){
    if(!ID.test(String(guildId))||!ID.test(String(adminId)))throw Error('Ungültige Berechtigung');
    const guild=client.guilds.cache.get(String(guildId));
    if(!guild)throw Error('Der Bot ist nicht auf diesem Discord-Server');
    const user=await guild.members.fetch(String(adminId)).catch(()=>null);
    if(!user||!user.permissions.has(1n<<7n))throw Error('Du brauchst „Audit-Log anzeigen“ auf diesem Server');
    return guild;
  }
  async function onEntry(entry,guild){
    if(!guild||!ID.test(String(guild.id)))return null;
    const event=classify(entry,guild.roles?.cache||new Map());
    if(!event)return null;
    event.guildId=guild.id;
    if(recentlySeen.has(event.id))return null;
    recentlySeen.set(event.id,Date.now());
    for(const [id,time] of recentlySeen)if(Date.now()-time>4*60*1000)recentlySeen.delete(id);
    let saved;
    try { saved=await ledger.append(event); }
    catch(err){console.error('Sicherheitslog konnte nicht dauerhaft gespeichert werden:',err.message);return null}
    // Private opted-in owner alerts do not depend on a public Discord log channel.
    if(ownerAlerts)await ownerAlerts.notify(event,guild).catch(e=>console.warn('Private owner alert:',e.message));
    const cfg=store.state.guilds[guild.id]||{};
    if(!cfg.logChannelId||SEVERITY[event.level]<SEVERITY[cfg.logMinLevel||'info'])return saved;
    const channel=await guild.channels.fetch(cfg.logChannelId).catch(()=>null);
    if(!channel?.send)return saved;
    const displayRole=event.affectedRoles.length?event.affectedRoles.slice(0,8).map(r=>(r.operation==='add'?'+ ':'− ')+r.name).join('\n'):'—';
    const alert=event.level==='critical';
    const {EmbedBuilder}=require('discord.js');
    const marker=event.level==='critical'?'nv_alert':'nv_audit';
    const symbol=store.state.appEmojis?.[marker]?'<:'+marker+'_flat:'+store.state.appEmojis[marker]+'> ':' ';
    const embed=new EmbedBuilder().setColor(alert?0xDF4157:event.level==='warning'?0xD49A3A:0x6477ED)
      .setTitle(alert?'KRITISCHE SICHERHEITSÄNDERUNG':event.level==='warning'?'Sicherheitsereignis':'Rollen- und Rechteprotokoll')
      .setDescription(symbol+event.summary.slice(0,900))
      .addFields(
        {name:'Ausgeführt von',value:event.actorId?'<@'+event.actorId+'>':'Discord hat keinen Akteur geliefert',inline:true},
        {name:'Betroffen',value:event.targetId?'<@'+event.targetId+'>':'Rolle oder Server',inline:true},
        ...(event.initiatedBy?[{name:'Im Dashboard angefordert von',value:'<@'+event.initiatedBy+'>',inline:true}]:[]),
        {name:'Rollen',value:displayRole.slice(0,900)},
        {name:'Typ',value:event.action+' · '+event.level,inline:true},
        {name:'Sicherheits-Prüfsumme',value:'`'+saved.hash.slice(0,16)+'…`',inline:true})
      .setTimestamp(new Date(event.createdAt)).setFooter({text:'Novora Security · '+saved.count+' · Gespeichertes Prüfprotokoll'});
    if(event.addedRights.length)embed.addFields({name:'Neue kritische Rechte',value:event.addedRights.join(', ').slice(0,900)});
    if(event.removedRights?.length)embed.addFields({name:'Entfernte kritische Rechte',value:event.removedRights.join(', ').slice(0,900)});
    await channel.send({embeds:[embed],allowedMentions:{parse:[]}}).catch(e=>console.warn('Lognachricht konnte nicht gesendet werden:',e.message));
    return saved;
  }
  async function list(guildId,adminId,opts={}){
    await canRead(guildId,adminId);
    return ledger.list(guildId,opts);
  }
  async function status(guildId,adminId){
    await canRead(guildId,adminId);
    const result=ledger.status(guildId);
    return {ok:result.ok,count:result.count,hash:result.head,error:result.error||null,
      channelId:store.state.guilds[guildId]?.logChannelId||null,
      minLevel:store.state.guilds[guildId]?.logMinLevel||'info'};
  }
  return {onEntry,list,status,canRead,exportText:ledger.exportText,ledger};
}
module.exports={makeSecurityCenter};
