'use strict';
// Administrator-owned private alerts. These labels NEVER alter Discord's actual guild owner.
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const ID=/^\d{15,22}$/;
const CATEGORIES=['critical','roles','moderation','system'];
const CATEGORY_NAMES={critical:'Kritische Warnungen',roles:'Rollenänderungen',moderation:'Moderation',system:'Server und Webhooks'};
function classifyAlert(event){
  if(event?.level==='critical')return 'critical';
  if(['member_roles','role_create','role_update','role_delete'].includes(event?.action))return 'roles';
  if(event?.action==='moderation')return 'moderation';
  return 'system';
}
function makeOwnerAlerts({client,store}){
  async function guildAdmin(guildId,adminId){
    if(!ID.test(String(guildId))||!ID.test(String(adminId)))throw Error('Ungültige Server- oder Nutzer-ID');
    const guild=client.guilds.cache.get(guildId);
    if(!guild)throw Error('Server nicht verbunden');
    const member=await guild.members.fetch({user:adminId,force:true}).catch(()=>null);
    if(!member||(guild.ownerId!==adminId&&!member.permissions.has(PermissionsBitField.Flags.Administrator)))
      throw Error('Nur Administratoren dieses Servers können sich für private Owner-Warnungen anmelden.');
    return guild;
  }
  function configs(guildId){
    const cfg=store.state.guilds[guildId]||(store.state.guilds[guildId]={});
    return cfg.ownerNotifications||(cfg.ownerNotifications={});
  }
  function publicProfile(userId,settings={}){
    return {userId,enabled:settings.enabled===true,muted:CATEGORIES.filter(x=>settings.muted?.includes(x)),joinedAt:settings.joinedAt||null};
  }
  async function get(guildId,adminId){
    const guild=await guildAdmin(guildId,adminId);
    return {ok:true,guildId,guildName:guild.name,profile:publicProfile(adminId,configs(guildId)[adminId]),
      categories:CATEGORIES.map(id=>({id,label:CATEGORY_NAMES[id]}))};
  }
  async function update(guildId,adminId,{action,category}={}){
    await guildAdmin(guildId,adminId);
    const list=configs(guildId);
    const current=list[adminId]||{enabled:false,muted:[],joinedAt:Date.now()};
    if(!['enable','disable','mute','unmute'].includes(action))throw Error('Ungültige Benachrichtigungsaktion');
    if(['mute','unmute'].includes(action)&&!CATEGORIES.includes(category))throw Error('Unbekannte Benachrichtigungsart');
    let notice='';
    if(action==='enable'){
      current.enabled=true;
      notice='Du bist jetzt für private Owner-Warnungen angemeldet.';
    }else if(action==='disable'){
      current.enabled=false;
      notice='Du hast alle privaten Owner-Benachrichtigungen deaktiviert. Du erhältst keine neuen Meldungen, bis du sie wieder aktivierst.';
    }else if(action==='mute'){
      current.muted=[...new Set([...(current.muted||[]),category])];
      notice='Du hast „'+CATEGORY_NAMES[category]+'“ deaktiviert. Dazu erhältst du keine privaten Meldungen mehr, bis du die Stummschaltung aufhebst.';
    }else{
      current.muted=(current.muted||[]).filter(x=>x!==category);
      notice='Du bekommst „'+CATEGORY_NAMES[category]+'“ wieder als private Benachrichtigung.';
    }
    list[adminId]=current;
    await store.persist();
    return {ok:true,profile:publicProfile(adminId,current),notice};
  }
  async function notify(event,guild){
    if(!guild||!ID.test(String(guild.id)))return;
    const recipients=Object.entries(store.state.guilds[guild.id]?.ownerNotifications||{});
    if(!recipients.length)return;
    const category=classifyAlert(event);
    const eligible=recipients.filter(([,c])=>c?.enabled===true&&!c.muted?.includes(category)).slice(0,12);
    for(const [id] of eligible){
      try{
        await guildAdmin(guild.id,id); // permissions can be revoked at any time
        const embed=new EmbedBuilder().setColor(event.level==='critical'?0xdb4556:0x6577e6)
          .setTitle(event.level==='critical'?'Novora · Sicherheitsalarm':'Novora · '+CATEGORY_NAMES[category])
          .setDescription(String(event.summary||'Neues Sicherheitsereignis').slice(0,400))
          .addFields(
            {name:'Server',value:String(guild.name||guild.id).slice(0,100),inline:true},
            {name:'Ausgeführt von',value:event.actorId?'<@'+event.actorId+'>':'Nicht ermittelbar',inline:true},
            {name:'Betroffen',value:event.targetId?'<@'+event.targetId+'>':'Server/Rolle',inline:true})
          .addFields(...(event.affectedRoles?.length?[{name:'Rollen',value:event.affectedRoles.slice(0,8).map(r=>(r.operation==='add'?'+ ':'− ')+String(r.name||'Unbekannt').slice(0,60)).join('\n').slice(0,900)}]:[]))
          .addFields(...(event.addedRights?.length?[{name:'Kritische Rechte',value:event.addedRights.slice(0,8).join(', ').slice(0,900)}]:[]))
          .setFooter({text:'Novora Security · '+String(event.id||'').slice(0,18)})
          .setTimestamp(event.createdAt||Date.now());
        await (await client.users.fetch(id)).send({embeds:[embed],allowedMentions:{parse:[]}});
      }catch(e){console.warn('Owner-DM nicht zustellbar ('+guild.id+'): '+String(e.message).slice(0,120));}
    }
  }
  return {get,update,notify,guildAdmin,classifyAlert};
}
module.exports={makeOwnerAlerts,classifyAlert,CATEGORIES,CATEGORY_NAMES};
