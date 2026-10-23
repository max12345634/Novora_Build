'use strict';
// On-demand, short-lived message previews from public server channels only.
// No message bodies are saved to state.json, AppDeploy or logs.
const {PermissionsBitField, ChannelType}=require('discord.js');
const id=v=>/^\d{15,22}$/.test(String(v||''))?String(v):'';
async function userMessages({client,guildId,userId,adminId,limit=16}){
  if(!id(guildId)||!id(userId)||!id(adminId))throw Error('Ungültige Discord-ID');
  const guild=client.guilds.cache.get(guildId);
  if(!guild)throw Error('Bot ist nicht auf diesem Server');
  const admin=await guild.members.fetch({user:adminId,force:true}).catch(()=>null);
  if(!admin||(guild.ownerId!==adminId&&!admin.permissions.has(PermissionsBitField.Flags.Administrator)))throw Error('Nur Serveradministratoren');
  const bot=await guild.members.fetchMe();
  const chans=[...guild.channels.cache.values()].filter(ch=>ch.type===ChannelType.GuildText &&
     ch.permissionsFor(guild.roles.everyone)?.has(PermissionsBitField.Flags.ViewChannel) &&
     ch.permissionsFor(bot)?.has([PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.ReadMessageHistory])).slice(0,10);
  const out=[];
  for (const ch of chans){
    try{
      const messages=await ch.messages.fetch({limit:Math.min(50,Math.max(10,limit*2))});
      for(const m of messages.values())if(m.author.id===userId){
        out.push({id:m.id,guildId,channelId:ch.id,channel:ch.name,at:m.createdTimestamp,
          text:String(m.content||'').slice(0,800),url:`https://discord.com/channels/${guildId}/${ch.id}/${m.id}`});
      }
    }catch{/* Channel may be inaccessible or have changed during request */}
  }
  return {guildId,userId,items:out.sort((a,b)=>b.at-a.at).slice(0,Math.min(25,Math.max(1,limit))),
    note:'Nur öffentliche Textkanäle, die der Bot lesen darf. Für Texte wird Discord Message Content Intent benötigt. Keine Speicherung.'};
}
module.exports={userMessages};
