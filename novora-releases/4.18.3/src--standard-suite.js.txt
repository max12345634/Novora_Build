'use strict';
const crypto=require('node:crypto');
const {SlashCommandBuilder,PermissionFlagsBits,MessageFlags,ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const EP=MessageFlags.Ephemeral;
const commands=[
 new SlashCommandBuilder().setName('giveaway').setDescription('Gewinnspiel starten (Team)').addStringOption(o=>o.setName('preis').setDescription('Gewinn').setRequired(true).setMaxLength(100)).addIntegerOption(o=>o.setName('minuten').setDescription('Laufzeit (1–10080)').setRequired(true).setMinValue(1).setMaxValue(10080)),
 new SlashCommandBuilder().setName('giveaway-ziehen').setDescription('Gewinnspiel auslosen (Team)').addStringOption(o=>o.setName('id').setDescription('Gewinnspiel-ID').setRequired(true)),
 new SlashCommandBuilder().setName('rollen-panel').setDescription('Selbstzuweisbares Rollenpanel veröffentlichen (Team)').addRoleOption(o=>o.setName('rolle').setDescription('Auswählbare Rolle').setRequired(true)),
 new SlashCommandBuilder().setName('vorschlag').setDescription('Community-Vorschlag einreichen').addStringOption(o=>o.setName('text').setDescription('Dein Vorschlag').setRequired(true).setMaxLength(800)),
 new SlashCommandBuilder().setName('vorschlag-status').setDescription('Vorschlag entscheiden (Team)').addStringOption(o=>o.setName('id').setDescription('Vorschlags-ID').setRequired(true)).addStringOption(o=>o.setName('status').setDescription('Entscheidung').setRequired(true).addChoices({name:'In Bearbeitung',value:'review'},{name:'Angenommen',value:'accepted'},{name:'Abgelehnt',value:'rejected'})),
 new SlashCommandBuilder().setName('warnung').setDescription('Mitglied verwarnen (Moderation)').addUserOption(o=>o.setName('mitglied').setDescription('Mitglied').setRequired(true)).addStringOption(o=>o.setName('grund').setDescription('Grund').setRequired(true).setMaxLength(400)),
 new SlashCommandBuilder().setName('warnungen').setDescription('Verwarnungen eines Mitglieds anzeigen (Moderation)').addUserOption(o=>o.setName('mitglied').setDescription('Mitglied').setRequired(true)),
 new SlashCommandBuilder().setName('rank').setDescription('Deinen Aktivitätslevel anzeigen'),
 new SlashCommandBuilder().setName('event-erstellen').setDescription('Event mit Anmeldung erstellen (Team)').addStringOption(o=>o.setName('titel').setDescription('Eventname').setRequired(true).setMaxLength(100)).addIntegerOption(o=>o.setName('minuten').setDescription('Start in Minuten').setRequired(true).setMinValue(1).setMaxValue(10080)),
 new SlashCommandBuilder().setName('event-liste').setDescription('Kommende Events anzeigen')
];
const safe=(x,n=800)=>String(x||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/@everyone|@here/gi,'[Erwähnung]').slice(0,n);
function makeStandardSuite({store}){
 store.state.standardSystems ||= {};
 const locks=new Set();
 const state=(g)=>store.state.standardSystems[g]||{giveaways:{},suggestions:{},warnings:{},xp:{},events:{}};
 async function mutate(g,fn){if(locks.has(g))throw Error('Ein anderer Vorgang läuft. Bitte wiederholen.');locks.add(g);try{const before=store.state.standardSystems[g];const next=structuredClone(state(g));const result=fn(next);store.state.standardSystems[g]=next;try{await store.persist();}catch(e){if(before===undefined)delete store.state.standardSystems[g];else store.state.standardSystems[g]=before;throw e;}return result;}finally{locks.delete(g);}}
 const button=(id,label,style=ButtonStyle.Primary)=>new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style));
 async function onInteraction(i){
  const isButton=i.isButton?.()&&i.customId?.startsWith('nvstd:');
  if(!isButton&&!i.isChatInputCommand?.())return false;
  if(!isButton&&!commands.some(c=>c.toJSON().name===i.commandName))return false;
  if(!i.inGuild?.())return i.reply({content:'Nur auf Servern verfügbar.',flags:EP});
  const g=i.guildId,u=i.user.id,admin=!!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild),mod=!!i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers);
  const reply=(content,priv=true)=>i.reply({content,flags:priv?EP:undefined,allowedMentions:{parse:[]}});
  if(isButton){const [,type,id]=i.customId.split(':');let result;
   if(type==='giveaway')result=await mutate(g,s=>{const x=s.giveaways[id];if(!x||x.ends<=Date.now()||x.winner)throw Error('Gewinnspiel beendet oder unbekannt.');x.users ||= [];if(x.users.includes(u)){x.users=x.users.filter(v=>v!==u);return 'Teilnahme zurückgezogen.';}x.users.push(u);return 'Du nimmst am Gewinnspiel teil.';});
   else if(type==='vote')result=await mutate(g,s=>{const x=s.suggestions[id];if(!x)throw Error('Vorschlag nicht gefunden.');x.votes ||= [];if(x.votes.includes(u)){x.votes=x.votes.filter(v=>v!==u);return 'Stimme zurückgezogen.';}x.votes.push(u);return 'Stimme gezählt.';});
   else if(type==='event')result=await mutate(g,s=>{const x=s.events[id];if(!x||x.starts<=Date.now())throw Error('Event ist bereits gestartet.');x.users ||= [];if(x.users.includes(u)){x.users=x.users.filter(v=>v!==u);return 'Abgemeldet.';}x.users.push(u);return 'Für das Event angemeldet.';});
   else if(type==='role'){const role=await i.guild.roles.fetch(id).catch(()=>null);const me=i.guild.members.me||await i.guild.members.fetchMe();if(!role||role.managed||role.position>=me.roles.highest.position||role.permissions.has(PermissionFlagsBits.Administrator)||role.permissions.has(PermissionFlagsBits.ManageGuild))throw Error('Diese Rolle darf nicht selbst vergeben werden.');const member=await i.guild.members.fetch(u);if(member.roles.cache.has(id)){await member.roles.remove(id);result='Rolle entfernt.';}else{await member.roles.add(id);result='Rolle vergeben.';}}
   else return false;
   return reply(result);
  }
  const name=i.commandName,opts=i.options;
  if(name==='rank'){const x=state(g).xp[u]||{xp:0};return reply(`Level **${Math.floor(Math.sqrt(x.xp/100))}** · ${x.xp} XP`);}
  if(name==='event-liste'){const list=Object.entries(state(g).events).filter(([,v])=>v.starts>Date.now()).slice(-10);return reply(list.length?list.map(([id,v])=>`${id}: ${safe(v.title,100)} · <t:${Math.floor(v.starts/1000)}:f> · ${(v.users||[]).length} Anmeldungen`).join('\n'):'Keine kommenden Events.');}
  if(name==='vorschlag'){const id=crypto.randomBytes(4).toString('hex');const text=safe(opts.getString('text'));await mutate(g,s=>{s.suggestions[id]={text,user:u,votes:[],status:'open',at:Date.now()};});return i.reply({content:`💡 **Vorschlag ${id}**\n${text}`,components:[button(`nvstd:vote:${id}`,'Dafür stimmen')],allowedMentions:{parse:[]}});}
  if(['warnung','warnungen'].includes(name)){if(!mod&&!admin)return reply('Moderationsberechtigung erforderlich.');const target=opts.getUser('mitglied');if(name==='warnungen'){const list=state(g).warnings[target.id]||[];return reply(list.length?list.slice(-10).map((v,n)=>`${n+1}. ${safe(v.reason,200)} · <t:${Math.floor(v.at/1000)}:f>`).join('\n'):'Keine Verwarnungen.');}await mutate(g,s=>{(s.warnings[target.id] ||= []).push({reason:safe(opts.getString('grund'),400),by:u,at:Date.now()});s.warnings[target.id]=s.warnings[target.id].slice(-100);});return reply(`Verwarnung für ${target.username} gespeichert.`);}
  if(!admin)return reply('Berechtigung „Server verwalten“ erforderlich.');
  if(name==='giveaway'){const id=crypto.randomBytes(4).toString('hex'),price=safe(opts.getString('preis'),100),ends=Date.now()+opts.getInteger('minuten')*60000;await mutate(g,s=>{s.giveaways[id]={price,ends,users:[]};});return i.reply({content:`🎁 **Giveaway ${id}: ${price}**\nEnde: <t:${Math.floor(ends/1000)}:R>\nAuslosung durch das Team mit /giveaway-ziehen.`,components:[button(`nvstd:giveaway:${id}`,'Teilnehmen')],allowedMentions:{parse:[]}});}
  if(name==='giveaway-ziehen'){const id=opts.getString('id');const result=await mutate(g,s=>{const x=s.giveaways[id];if(!x)throw Error('Unbekannte Giveaway-ID.');if(x.winner)throw Error('Bereits ausgelost.');if(x.ends>Date.now())throw Error('Laufzeit noch nicht beendet.');if(!x.users?.length)throw Error('Keine Teilnahmen.');const winner=x.users[crypto.randomInt(x.users.length)];x.winner=winner;return winner;});return reply(`Gewinnspiel ${id}: Gewinner-ID **${result}**.`,false);}
  if(name==='rollen-panel'){const role=opts.getRole('rolle');const me=i.guild.members.me||await i.guild.members.fetchMe();if(role.managed||role.position>=me.roles.highest.position||role.permissions.has(PermissionFlagsBits.Administrator)||role.permissions.has(PermissionFlagsBits.ManageGuild))return reply('Diese Rolle ist für Selbstzuweisung nicht sicher.');return i.reply({content:`🎭 **Rollen-Auswahl**\nRolle: ${safe(role.name,100)}`,components:[button(`nvstd:role:${role.id}`,'Rolle an-/abwählen')],allowedMentions:{parse:[]}});}
  if(name==='vorschlag-status'){const id=opts.getString('id'),status=opts.getString('status');await mutate(g,s=>{if(!s.suggestions[id])throw Error('Vorschlag nicht gefunden.');s.suggestions[id].status=status;});return reply(`Vorschlag ${id}: ${status}`);}
  if(name==='event-erstellen'){const id=crypto.randomBytes(4).toString('hex'),title=safe(opts.getString('titel'),100),starts=Date.now()+opts.getInteger('minuten')*60000;await mutate(g,s=>{s.events[id]={title,starts,users:[]};});return i.reply({content:`📅 **${title}**\nStart: <t:${Math.floor(starts/1000)}:f>`,components:[button(`nvstd:event:${id}`,'An-/Abmelden')],allowedMentions:{parse:[]}});}
  return false;
 }
 const cooldown=new Map();
 async function onMessage(m){if(!m.guildId||m.author?.bot||!m.author?.id||!m.content?.trim())return;const key=m.guildId+':'+m.author.id,now=Date.now();if(now-(cooldown.get(key)||0)<60000)return;cooldown.set(key,now);if(cooldown.size>10000)cooldown.clear();await mutate(m.guildId,s=>{const x=s.xp[m.author.id]||{xp:0};x.xp=Math.min(10000000,x.xp+10);s.xp[m.author.id]=x;}).catch(()=>{});}
 return {commands,onInteraction,onMessage};
}
module.exports={makeStandardSuite,commands};
