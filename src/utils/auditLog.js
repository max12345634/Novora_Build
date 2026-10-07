const { EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('./guildSettings');
const { logger } = require('./logger');
const RANK={basis:1,erweitert:2,alles:3};
function needed(title){
  if (/Nachricht|Voice/i.test(title)) return 3;
  if (/Kanal|Rolle|Mitglied geändert/i.test(title)) return 2;
  return 1;
}
async function sendLog(guild,title,description,channelOverride=null){
  try{
    const settings=(await getGuildSettings(guild.id)).logs;
    const channelId=channelOverride||settings?.channelId;
    if((!settings?.enabled&&!channelOverride)||!channelId)return;
    if(!channelOverride&&(RANK[settings?.profile||'basis']||1)<needed(String(title)))return;
    const channel=await guild.channels.fetch(channelId).catch(()=>null);
    if(!channel?.isTextBased())return;
    await channel.send({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle(String(title).slice(0,256))
      .setDescription(String(description||'Keine weiteren Details.').slice(0,4000)).setFooter({text:'Novora Logs · '+(settings?.profile||'basis')}).setTimestamp()],allowedMentions:{parse:[]}});
  }catch(error){logger.warn('Serverereignis konnte nicht protokolliert werden.',error);}
}
module.exports={sendLog};
