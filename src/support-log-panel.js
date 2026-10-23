'use strict';
const {EmbedBuilder}=require('discord.js');
const clean=v=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/@everyone|@here/g,'[Erwähnung]').slice(0,900);
function buildSupportLog(text){
 const raw=clean(text);const parts=raw.split(' · ');const title=parts.shift()||'Support-Ereignis';
 const voice=/Voice-Support|Support-Feedback|Bewertung/i.test(title);
 const fields=[];let actor=null,target=null;
 for(const part of parts){
  let m;
  if((m=/^(?:User|Nutzer|Antragsteller) (\d{15,22})$/.exec(part))){target=m[1];continue;}
  if((m=/^(?:Team|Supporter) (\d{15,22})$/.exec(part))){actor=m[1];continue;}
  if((m=/^(?:Raum) (\d{15,22})$/.exec(part))){fields.push({name:'Sprachraum',value:`<#${m[1]}>`,inline:true});continue;}
  if((m=/^(?:Nachrichten) (\d+)$/.exec(part))){fields.push({name:'Nachrichten',value:m[1],inline:true});continue;}
  if((m=/^(?:Fall) (.+)$/.exec(part))){fields.push({name:'Fall-ID',value:'`'+clean(m[1]).replace(/`/g,'')+'`',inline:true});continue;}
  if((m=/^(?:Transkript) (.+)$/.exec(part))){fields.push({name:'Transkript',value:clean(m[1]).slice(0,950)||'—',inline:false});continue;}
  if(/^[0-9a-f-]{20,}$/i.test(part)){fields.push({name:'Fall-ID',value:'`'+part+'`',inline:true});continue;}
  fields.push({name:'Details',value:clean(part)||'—',inline:false});
 }
 const embed=new EmbedBuilder().setColor(/geschlossen|beendet/i.test(title)?0x36A587:/übernommen/i.test(title)?0x4B7CE8:voice?0x7769DB:0xE6A451)
  .setTitle((voice?'🎧 ':'🎟️ ')+clean(title).slice(0,190))
  .setDescription(voice?'**Voice-Support · Ereignisprotokoll**':'**Tickets · Ereignisprotokoll**')
  .addFields({name:'Betroffenes Mitglied',value:target?`<@${target}>\n\`${target}\``:'Nicht übermittelt',inline:true},
    {name:'Ausgeführt von',value:actor?`<@${actor}>\n\`${actor}\``:target&&/eröffnet|Anfrage|Bewertung/i.test(title)?`<@${target}>`:'Nicht übermittelt',inline:true},
    ...fields.slice(0,20)).setTimestamp();
 return {embeds:[embed],allowedMentions:{parse:[]}};
}
module.exports={buildSupportLog};
