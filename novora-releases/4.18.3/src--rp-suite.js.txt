'use strict';
const {SlashCommandBuilder,PermissionFlagsBits,MessageFlags,ModalBuilder,TextInputBuilder,TextInputStyle,ActionRowBuilder}=require('discord.js');
const EP=MessageFlags.Ephemeral;
const commands=[
 new SlashCommandBuilder().setName('rp-start').setDescription('Notruf Hamburg: RP-Runde starten (Team)').addStringOption(o=>o.setName('thema').setDescription('RP-Thema').setRequired(true).setMaxLength(120)),
 new SlashCommandBuilder().setName('rp-ende').setDescription('Aktive RP-Runde beenden (Team)'),
 new SlashCommandBuilder().setName('rp-status').setDescription('Aktuellen RP-Status anzeigen'),
 new SlashCommandBuilder().setName('rp-dienst').setDescription('Für die RP-Runde an- oder abmelden').addStringOption(o=>o.setName('aktion').setDescription('Dienststatus').setRequired(true).addChoices({name:'Anmelden',value:'an'},{name:'Abmelden',value:'aus'})),
 new SlashCommandBuilder().setName('rp-meldung').setDescription('RP-Vorfall vertraulich ans Team melden'),
 new SlashCommandBuilder().setName('rp-meldungen').setDescription('Letzte RP-Meldungen einsehen (Serververwaltung)')
];
const clean=(s,max=200)=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/@everyone|@here/gi,'[Erwähnung]').trim().slice(0,max);
function makeRpSuite({store}){
 store.state.rpSessions ||= {};store.state.rpReports ||= {};
 const locks=new Set();
 async function onInteraction(i){
  if(i.isModalSubmit?.()&&i.customId==='nvrp:report'){
   if(!i.inGuild())return i.reply({content:'Nur auf einem Server.',flags:EP});
   const text=clean(i.fields.getTextInputValue('description'),1400);
   if(text.length<10)return i.reply({content:'Bitte beschreibe den Vorfall genauer.',flags:EP});
   const id=i.guildId;if(locks.has(id))return i.reply({content:'Bitte erneut versuchen.',flags:EP});locks.add(id);
   try{const list=store.state.rpReports[id]||[];const next=[...list.slice(-99),{userId:i.user.id,text,at:Date.now()}];store.state.rpReports[id]=next;
    try{await store.persist();}catch(e){store.state.rpReports[id]=list;throw e;}
    return i.reply({content:'Deine RP-Meldung wurde vertraulich gespeichert. Nur Serveradministratoren können die gespeicherten Daten über die Bot-Datenverwaltung einsehen.',flags:EP});
   }finally{locks.delete(id);}
  }
  if(!i.isChatInputCommand?.()||!commands.some(c=>c.toJSON().name===i.commandName))return false;
  if(!i.inGuild())return i.reply({content:'Nur auf einem Discord-Server verfügbar.',flags:EP});
  const id=i.guildId,admin=!!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  const current=store.state.rpSessions[id];
  if(i.commandName==='rp-status')return i.reply({content:current?.active?`🟢 **RP läuft** – ${clean(current.topic)}\nStart: <t:${Math.floor(current.started/1000)}:R>\nAngemeldete: ${Object.keys(current.members||{}).length}`:'⚪ Aktuell läuft keine RP-Runde.',flags:EP});
  if(i.commandName==='rp-meldungen'){
   if(!admin)return i.reply({content:'Nur mit Berechtigung „Server verwalten“.',flags:EP});
   const list=(store.state.rpReports[id]||[]).slice(-5).reverse();
   return i.reply({content:list.length?list.map((r,n)=>`${n+1}. <@${r.userId}> · <t:${Math.floor(r.at/1000)}:f>\n${clean(r.text,230)}`).join('\n\n').slice(0,1900):'Keine RP-Meldungen vorhanden.',flags:EP,allowedMentions:{parse:[]}});
  }
  if(i.commandName==='rp-meldung'){
   const modal=new ModalBuilder().setCustomId('nvrp:report').setTitle('RP-Vorfall melden');
   modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Was ist im RP passiert?').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1400).setRequired(true)));
   return i.showModal(modal);
  }
  if(['rp-start','rp-ende'].includes(i.commandName)&&!admin)return i.reply({content:'Dafür benötigst du die Berechtigung „Server verwalten“.',flags:EP});
  if(locks.has(id))return i.reply({content:'Ein anderer RP-Vorgang läuft gerade. Bitte erneut versuchen.',flags:EP});locks.add(id);
  try{
   if(i.commandName==='rp-start'){
    if(current?.active)return i.reply({content:'Es läuft bereits eine RP-Runde. Nutze `/rp-ende`.',flags:EP});
    const topic=clean(i.options.getString('thema'),120);if(!topic)return i.reply({content:'RP-Thema fehlt.',flags:EP});
    const next={active:true,topic,started:Date.now(),startedBy:i.user.id,members:{}};
    store.state.rpSessions[id]=next;try{await store.persist();}catch(e){if(current)store.state.rpSessions[id]=current;else delete store.state.rpSessions[id];throw e;}
    return i.reply({content:`🟢 **RP gestartet:** ${topic}\nMitglieder können sich mit \`/rp-dienst\` anmelden.`,allowedMentions:{parse:[]}});
   }
   if(i.commandName==='rp-ende'){
    if(!current?.active)return i.reply({content:'Es läuft keine RP-Runde.',flags:EP});
    delete store.state.rpSessions[id];try{await store.persist();}catch(e){store.state.rpSessions[id]=current;throw e;}
    return i.reply({content:`🔴 RP beendet. Angemeldet waren ${Object.keys(current.members||{}).length} Mitglieder.`,allowedMentions:{parse:[]}});
   }
   if(!current?.active)return i.reply({content:'Aktuell läuft keine RP-Runde.',flags:EP});
   const members={...current.members};const action=i.options.getString('aktion');
   if(action==='an')members[i.user.id]=Date.now();else if(action==='aus')delete members[i.user.id];else return i.reply({content:'Ungültige Aktion.',flags:EP});
   store.state.rpSessions[id]={...current,members};try{await store.persist();}catch(e){store.state.rpSessions[id]=current;throw e;}
   return i.reply({content:action==='an'?'Du bist für diese RP-Runde angemeldet.':'Du bist für diese RP-Runde abgemeldet.',flags:EP});
  }finally{locks.delete(id);}
 }
 return {commands,onInteraction};
}
module.exports={makeRpSuite,commands};
