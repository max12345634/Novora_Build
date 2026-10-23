'use strict';
const crypto=require('node:crypto');
const {ActionRowBuilder,StringSelectMenuBuilder,ChannelSelectMenuBuilder,RoleSelectMenuBuilder,
 ButtonBuilder,ButtonStyle,ChannelType,PermissionFlagsBits,MessageFlags,EmbedBuilder}=require('discord.js');
const {setupCommand}=require('./setup-menu');
const ui=require('./ui-v2');
const ICONS={tickets:'nv_ticket',voice:'nv_voice',partnerschaft:'nv_partner',verify:'nv_verify',panel:'nv_open',logs:'nv_audit',emojis:'nv_settings',panelrefresh:'nv_refresh',partnersync:'nv_refresh',status:'nv_status',application:'nv_application',faction:'nv_faction',welcome:'nv_welcome'};

const TTL=12*60_000;
const choices=[
 {value:'tickets',label:'Ticket-System',description:'Ticketkanal, Teamrolle, Archiv und Bewertungen',emoji:'🎟️'},
 {value:'application',label:'Team-Bewerbungen',description:'Private Team-Bewerbungen per Bot-DM',emoji:'📋'},
 {value:'faction',label:'Fraktionen',description:'Legale / illegale Anträge und Forumfreigabe',emoji:'⚑'},
 {value:'welcome',label:'Willkommen & Abschied',description:'Join-/Leave-Nachrichten einstellen',emoji:'👋'},
 {value:'voice',label:'Voice-Support',description:'Warteraum, Support-Vorlage, Benachrichtigungen',emoji:'🎧'},
 {value:'partnerschaft',label:'Partnerschaften',description:'Anträge, Team und Forum einrichten',emoji:'🤝'},
 {value:'verify',label:'Verifizierung',description:'Rollen nach Discord OAuth2 festlegen',emoji:'🛡️'},
 {value:'panel',label:'Panel veröffentlichen',description:'Ticket-, Partner- oder Verify-Panel senden',emoji:'📋'},
 {value:'logs',label:'Sicherheitslogs',description:'Log-Kanal auswählen',emoji:'🔒'},
 {value:'emojis',label:'Novora Emojis',description:'Flache Application-Emojis installieren',emoji:'✦'},
 {value:'panelrefresh',label:'Alle Panels aktualisieren',description:'Bestehende Panels mit neuem Design überschreiben',emoji:'🔄'},
 {value:'partnersync',label:'Partner synchronisieren',description:'Mitgliederzahlen und Forum-Tags prüfen',emoji:'🔄'},
 {value:'status',label:'Systemstatus',description:'Einrichtungen und Module überprüfen',emoji:'📊'}
];
const fields={
 tickets:[
  {key:'panel',name:'Ticket-Panelkanal',type:'channel',channels:[ChannelType.GuildText]},
  {key:'kategorie',name:'Kategorie für Tickets',type:'channel',channels:[ChannelType.GuildCategory]},
  {key:'team',name:'Support-Teamrolle',type:'role'},
  {key:'logs',name:'Interner Support-Logkanal',type:'channel',channels:[ChannelType.GuildText],optional:true},
  {key:'bewertungen',name:'Öffentliche Bewertungen',type:'channel',channels:[ChannelType.GuildText],optional:true},
  {key:'beschwerden',name:'Private Kategorie für Team-Beschwerden',type:'channel',channels:[ChannelType.GuildCategory],optional:true},
  {key:'beschwerdeteam',name:'Rolle des Beschwerde-Teams',type:'role',optional:true}
 ],
 voice:[
  {key:'warteraum',name:'Voice-Warteraum',type:'channel',channels:[ChannelType.GuildVoice]},
  {key:'benachrichtigung',name:'Team-Benachrichtigungen',type:'channel',channels:[ChannelType.GuildText]},
  {key:'vorlage',name:'Vorlage für private Sprachräume',type:'channel',channels:[ChannelType.GuildVoice]},
  {key:'team',name:'Voice-Support-Teamrolle',type:'role'},
  {key:'bewertungen',name:'Öffentliche Support-Bewertungen',type:'channel',channels:[ChannelType.GuildText],optional:true},
  {key:'logs',name:'Interne Voice-Logs',type:'channel',channels:[ChannelType.GuildText],optional:true}
 ],
 partnerschaft:[
  {key:'panel',name:'Partnerschafts-Panelkanal',type:'channel',channels:[ChannelType.GuildText]},
  {key:'tickets',name:'Kategorie für Partnerschaftstickets',type:'channel',channels:[ChannelType.GuildCategory]},
  {key:'forum',name:'Forum für Partnerwerbungen',type:'channel',channels:[ChannelType.GuildForum]},
  {key:'team',name:'Partnerschaftsteamrolle',type:'role'},
  {key:'partnerrolle',name:'Rolle für Partner',type:'role'},
  {key:'pingrolle',name:'Rolle für Forum-Erwähnungen',type:'role',optional:true},
  {key:'logkanal',name:'Interne Partnerschaftslogs',type:'channel',channels:[ChannelType.GuildText],optional:true}
 ],
 application:[
  {key:'panel',name:'Bewerbungs-Panelkanal',type:'channel',channels:[ChannelType.GuildText]},
  {key:'tickets',name:'Kategorie für Bewerbungen',type:'channel',channels:[ChannelType.GuildCategory]},
  {key:'team',name:'Bewerbungs-Teamrolle',type:'role'},
  {key:'logs',name:'Bewerbungs-Logkanal',type:'channel',channels:[ChannelType.GuildText],optional:true}
 ],
 faction:[
  {key:'panel',name:'Fraktions-Panelkanal',type:'channel',channels:[ChannelType.GuildText]},
  {key:'tickets',name:'Kategorie für Fraktionsanträge',type:'channel',channels:[ChannelType.GuildCategory]},
  {key:'team',name:'Fraktions-Teamrolle',type:'role'},
  {key:'legalforum',name:'Forum für legale Fraktionen',type:'channel',channels:[ChannelType.GuildForum]},
  {key:'illegalforum',name:'Forum für illegale Fraktionen',type:'channel',channels:[ChannelType.GuildForum]},
  {key:'logs',name:'Fraktions-Logkanal',type:'channel',channels:[ChannelType.GuildText],optional:true}
 ],
 welcome:[
  {key:'willkommen',name:'Willkommenskanal',type:'channel',channels:[ChannelType.GuildText],optional:true},
  {key:'abschied',name:'Abschiedskanal',type:'channel',channels:[ChannelType.GuildText],optional:true}
 ],
 verify:[
  {key:'rolle',name:'Verifizierungsrolle',type:'role'},
  {key:'entfernen',name:'Optionale Unverified-Rolle entfernen',type:'role',optional:true},
  {key:'kanal',name:'Kanal für das Verify-Panel',type:'channel',channels:[ChannelType.GuildText]}
 ],
 panel:[{key:'system',name:'Paneltyp',type:'choice',options:[
  {label:'Ticket-Panel',value:'tickets',description:'Allgemeine Supporttickets'},
  {label:'Partnerschafts-Panel',value:'partnerschaft',description:'Partneranfragen'},
  {label:'Verify-Panel',value:'verify',description:'Discord OAuth2 Verifizierung'},
  {label:'Team-Bewerbungs-Panel',value:'application',description:'Nur Team-Bewerbungen'},
  {label:'Fraktions-Panel',value:'faction',description:'Legale und illegale Fraktionen'}]},
  {key:'kanal',name:'In welchem Textkanal soll das Panel erscheinen?',type:'channel',channels:[ChannelType.GuildText]}],
 logs:[{key:'kanal',name:'Sicherheitslog-Kanal',type:'channel',channels:[ChannelType.GuildText]}],
 emojis:[],panelrefresh:[],partnersync:[],status:[]
};
const sessions=new Map();
function menuRow(id,emojis={}){return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
 .setCustomId('nvset:'+id+':menu').setPlaceholder('Welches System möchtest du einrichten?')
 .addOptions(choices.map(c=>{const id=emojis[ICONS[c.value]];return {...(id?{emoji:{id,name:ICONS[c.value]+'_flat'}}:{}),label:c.label,value:c.value,description:c.description};})));}
function mainMessage(id,emojis){
  const row=menuRow(id,emojis);
  return ui.payload({color:0x5865D6,lines:[
    '# Novora | Einrichtung',
    'Wähle den Bereich aus, den du für diesen Server einrichten möchtest. Die Konfiguration ist nur für dich sichtbar.'
   ],rows:[row.components]});
}
function stepMessage(s){
 const spec=fields[s.mode][s.index],total=fields[s.mode].length;
 const title=choices.find(c=>c.value===s.mode)?.label||'Einrichtung';
 let component;
 if(spec.type==='channel')component=new ChannelSelectMenuBuilder().setCustomId('nvset:'+s.id+':pick')
   .setPlaceholder('Kanal oder Kategorie auswählen').setChannelTypes(...spec.channels).setMinValues(1).setMaxValues(1);
 else if(spec.type==='role')component=new RoleSelectMenuBuilder().setCustomId('nvset:'+s.id+':pick')
   .setPlaceholder('Rolle auswählen').setMinValues(1).setMaxValues(1);
 else component=new StringSelectMenuBuilder().setCustomId('nvset:'+s.id+':pick').setPlaceholder('Paneltyp auswählen').addOptions(spec.options);
 const buttons=[new ButtonBuilder().setCustomId('nvset:'+s.id+':back').setStyle(ButtonStyle.Secondary).setLabel('Zur Übersicht')];
 if(spec.optional)buttons.push(new ButtonBuilder().setCustomId('nvset:'+s.id+':skip').setStyle(ButtonStyle.Secondary).setLabel('Überspringen'));
 return ui.payload({color:0x5865D6,lines:[
  '# '+title,
  '**Schritt '+(s.index+1)+' von '+total+'**',
  spec.name+'\n'+(spec.optional?'Optional – du kannst diesen Schritt überspringen.':'Wähle unten die passende Einstellung.')
 ],rows:[[component],buttons]});
}
function parseId(id){const m=/^nvset:([a-f0-9]{16}):(menu|pick|skip|back|apply)$/.exec(id||'');return m?{id:m[1],action:m[2]}:null;}
function hasSetupPermission(i){return i.inGuild()&&i.memberPermissions?.has(PermissionFlagsBits.Administrator)===true;}
function makeSetupFlow(onComplete,{getEmojis=()=>({}),getPanelOverview=async()=>[]}={}){
 async function open(i){
  if(!hasSetupPermission(i))return i.reply({content:'Nur Serveradministratoren dürfen Novora einrichten.',flags:MessageFlags.Ephemeral});
  const id=crypto.randomBytes(8).toString('hex');
  sessions.set(id,{id,userId:i.user.id,guildId:i.guildId,mode:null,index:0,values:{},created:Date.now()});
  for(const [k,s] of sessions)if(Date.now()-s.created>TTL)sessions.delete(k);
  return i.reply({...mainMessage(id,getEmojis()),flags:MessageFlags.Ephemeral|ui.FLAG});
 }
 async function onInteraction(i){
  const req=parseId(i.customId);if(!req)return false;
  if(!(i.isStringSelectMenu?.()||i.isChannelSelectMenu?.()||i.isRoleSelectMenu?.()||i.isButton?.()))return false;
  const s=sessions.get(req.id);
  if(!s||Date.now()-s.created>TTL){sessions.delete(req.id);await i.reply({content:'Dieses Setup ist abgelaufen. Bitte `/setup` erneut ausführen.',flags:MessageFlags.Ephemeral});return true;}
  if(s.userId!==i.user.id||s.guildId!==i.guildId||!hasSetupPermission(i)){
    await i.reply({content:'Dieses Setup gehört einem anderen Administrator oder Server.',flags:MessageFlags.Ephemeral});return true;
  }
  if(req.action==='back'&&i.isButton()){s.mode=null;s.index=0;s.values={};await i.update(mainMessage(s.id,getEmojis()));return true;}
  if(req.action==='menu'&&i.isStringSelectMenu()){
    const chosen=i.values[0];if(!Object.hasOwn(fields,chosen))return true;
    s.mode=chosen;s.index=0;s.values={};
    if(fields[chosen].length){await i.update(stepMessage(s));return true;}
    if(chosen==='panelrefresh'){
      const confirm=new ButtonBuilder().setCustomId('nvset:'+s.id+':apply').setStyle(ButtonStyle.Primary).setLabel('Alle Panels aktualisieren');
      const back=new ButtonBuilder().setCustomId('nvset:'+s.id+':back').setStyle(ButtonStyle.Secondary).setLabel('Abbrechen');
      const emojis=getEmojis(), icon=emojis.nv_refresh?`<:nv_refresh_flat:${emojis.nv_refresh}>`:'🔄';
      let overview;
      try{overview=await getPanelOverview(i.guild);}
      catch(e){overview=['⚠️ Prüfung fehlgeschlagen: '+String(e.message).slice(0,120)];}
      await i.update(ui.payload({color:0x5865D6,lines:[`# ${icon} Panels aktualisieren`,
        'Überprüfte Panel-Nachrichten dieses Servers:',
        ...(overview.length?overview:['Keine Panel-Einträge gefunden.']),
        'Nur veröffentlichte Panels werden aktualisiert. Gelöschte Nachrichten werden **nicht** doppelt gesendet.'],rows:[[confirm,back]]}));
      return true;
    }
    await i.deferUpdate();sessions.delete(s.id);
    try{await onComplete(i,chosen,{});}catch(e){await i.editReply(ui.payload({color:0xCB5260,lines:['# Einrichtung fehlgeschlagen',String(e.message).slice(0,180)]}));}
    return true;
  }
  if(req.action==='apply'&&i.isButton()&&s.mode==='panelrefresh'){
    await i.deferUpdate();sessions.delete(s.id);
    try{await onComplete(i,'panelrefresh',{});}
    catch(e){await i.editReply(ui.payload({color:0xCB5260,lines:['# Aktualisierung fehlgeschlagen',String(e.message).slice(0,180)]}));}
    return true;
  }
  if(!s.mode||!fields[s.mode]?.[s.index])return false;
  const spec=fields[s.mode][s.index];
  if(req.action==='skip'&&i.isButton()&&spec.optional)s.values[spec.key]=null;
  else if(req.action==='pick'&&((spec.type==='role'&&i.isRoleSelectMenu())||(spec.type==='channel'&&i.isChannelSelectMenu())||(spec.type==='choice'&&i.isStringSelectMenu()))){
    const value=i.values[0];
    if(spec.type==='choice'&&!spec.options.some(o=>o.value===value))return true;
    if(spec.type==='role'&&value===i.guildId){await i.reply({content:'Die @everyone-Rolle darf nicht verwendet werden.',flags:MessageFlags.Ephemeral});return true;}
    s.values[spec.key]=value;
  } else return false;
  s.index++;
  if(s.index<fields[s.mode].length){await i.update(stepMessage(s));return true;}
  await i.deferUpdate();sessions.delete(s.id);
  try{await onComplete(i,s.mode,s.values);}catch(e){await i.editReply(ui.payload({color:0xCB5260,lines:['# Einrichtung fehlgeschlagen',String(e.message).slice(0,180)]}));}
  return true;
 }
 return {open,onInteraction};
}
module.exports={makeSetupFlow,fields,choices,parseId,setupCommand};
