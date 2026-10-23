'use strict';
// Novora Partnerships: private per-guild tickets, explicit staff decisions and Discord forum posts.
const {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits, PermissionsBitField, MessageFlags,
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
}=require('discord.js');
const path=require('node:path');
const fs=require('node:fs');
const { randomUUID }=require('node:crypto');
const { recordAudit }=require('./control');
const {archiveTicket,tokenUrl}=require('./ticket-archive');
const {TIERS,tierFor,scorePartnership,tierCount}=require('./partnership-analysis');
const partnerArt=require('./partner-art');
const {decorate}=require('./panel-art');
const ui=require('./ui-v2');
const {refreshSavedPanel}=require('./panel-sync');

const ACTIONS=Object.freeze({
  apply:{label:'Partnerschaft beantragen',prefix:'antrag',description:'Neue Partnerschaft beantragen'},
  change:{label:'Partnerschaft ändern',prefix:'aenderung',description:'Werbung, Einladung oder Mitglieder aktualisieren'},
  cancel:{label:'Partnerschaft kündigen',prefix:'kuendigung',description:'Partnerschaft ordentlich beenden'}
});
const COLORS=Object.freeze({neutral:0x53648A,open:0x7285A5,claimed:0x5773D8,approved:0x238767,rejected:0xB34A5C});
const own=s=>String(s??'').replace(/<a?:[\w-]+:\d+>/g,'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u200B-\u200F]/gu,'').replace(/[^\p{L}\p{N} ._'\-]/gu,'').replace(/\s+/g,' ').trim().slice(0,85)||'Community';
const plain=(value,max=300)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const esc=s=>String(s).replace(/([\\*_~`|>])/g,'\\$1');
const nameSlug=value=>own(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,35)||'partner';

function iconTag(store,name,fallback=''){
  const id=store?.state?.appEmojis?.[name];
  return id?`<:${name}_flat:${id}>`:fallback;
}
function inviteCode(value){
  const s=String(value||'').trim();
  const m=s.match(/^https:\/\/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,40})(?:\/?(?:\?[^\s]*)?)?$/i);
  if(!m)throw Error('Bitte einen vollständigen Discord-Einladungslink (https://discord.gg/...) angeben.');
  return m[1];
}
function validateForm(kind,fields){
  if(!ACTIONS[kind])throw Error('Unbekannte Ticketart');
  const title=plain(fields.server,80);if(title.length<2)throw Error('Servername zu kurz');
  const invite=String(fields.invite||'').trim();
  if(invite)inviteCode(invite);
  if(kind==='apply'&&!invite)throw Error('Discord-Einladung erforderlich');
  const members=plain(fields.members||'',10);
  if(kind==='apply'&&(!/^\d{1,9}$/.test(members)||Number(members)<1))throw Error('Mitgliederzahl muss eine positive Zahl sein');
  if(kind==='change'&&members&&!/^\d{1,9}$/.test(members))throw Error('Mitgliederzahl muss eine Zahl sein');
  const advert=String(fields.advert||'').trim();
  if(kind==='apply'&&advert.length<10)throw Error('Bitte eine Serverwerbung eingeben (mindestens 10 Zeichen)');
  if(advert.length>1000)throw Error('Serverwerbung zu lang (maximal 1.000 Zeichen)');
  const extra=plain(fields.extra||'',450);
  if(kind==='cancel'&&extra.length<3)throw Error('Bitte einen Kündigungsgrund angeben');
  return {server:title,invite,members:members?Number(members):null,advert,extra,inviteKey:invite?inviteCode(invite):''};
}
const configFor=(store,gid)=>store.state.partnershipSettings?.[gid]||null;
const tickets=store=>store.state.partnershipTickets||(store.state.partnershipTickets={});
const partners=store=>store.state.partnershipRecords||(store.state.partnershipRecords={});
function settingsPayload(guild,opts){
  if(!guild||!guild.id)throw Error('Guild erforderlich');
  for(const key of ['panelChannel','ticketCategory','forumChannel','teamRole','partnerRole'])if(!opts[key])throw Error('Es fehlt: '+key);
  if(opts.panelChannel.type!==ChannelType.GuildText)throw Error('Panel braucht einen normalen Textkanal');
  if(opts.ticketCategory.type!==ChannelType.GuildCategory)throw Error('Ticketablage muss eine Discord-Kategorie sein');
  if(opts.forumChannel.type!==ChannelType.GuildForum)throw Error('Partnerschaftsbeiträge brauchen einen Forumkanal');
  if(opts.teamRole.id===guild.id||opts.partnerRole.id===guild.id)throw Error('@everyone darf keine Team- oder Partnerrolle sein');
  if(opts.teamRole.id===opts.partnerRole.id)throw Error('Teamrolle und Partnerrolle müssen verschieden sein');
  if(opts.pingRole&&opts.pingRole.id===guild.id)throw Error('@everyone als Ping-Rolle ist nicht erlaubt');
  return {panelChannelId:opts.panelChannel.id,ticketCategoryId:opts.ticketCategory.id,forumChannelId:opts.forumChannel.id,teamRoleId:opts.teamRole.id,partnerRoleId:opts.partnerRole.id,pingRoleId:opts.pingRole?.id||null,logChannelId:opts.logChannel?.id||null,panelMessageId:null,updatedAt:Date.now()};
}
function assertStaff(member,cfg,guild){
  if(!member||!guild||!cfg)return false;
  if(guild.ownerId===member.id)return true;
  if(member.permissions.has(PermissionFlagsBits.Administrator))return true;
  return member.roles.cache.has(cfg.teamRoleId);
}
function controls(ticket,store){
  const emojis=store?.state?.appEmojis||{};
  const buttonEmoji=name=>emojis[name]?{id:emojis[name],name:name+'_flat'}:undefined;
  const mark=(button,name)=>{const icon=buttonEmoji(name);return icon?button.setEmoji(icon):button;};
  if(ticket.status==='closed')return [];
  const row=new ActionRowBuilder();
  if(ticket.status==='open')row.addComponents(mark(new ButtonBuilder().setCustomId(`nvp:claim:${ticket.id}`).setLabel('Übernehmen').setStyle(ButtonStyle.Primary),'nv_claim'));
  if(ticket.status==='claimed')row.addComponents(mark(new ButtonBuilder().setCustomId(`nvp:release:${ticket.id}`).setLabel('Freigeben').setStyle(ButtonStyle.Secondary),'nv_wait'));
  if(ticket.status==='claimed')row.addComponents(
    mark(new ButtonBuilder().setCustomId(`nvp:approve:${ticket.id}`).setLabel('Annehmen').setStyle(ButtonStyle.Success),'nv_approved'),
    mark(new ButtonBuilder().setCustomId(`nvp:reject:${ticket.id}`).setLabel('Ablehnen').setStyle(ButtonStyle.Danger),'nv_denied')
  );
  if(ticket.status==='open'||ticket.status==='claimed')row.addComponents(mark(new ButtonBuilder().setCustomId(`nvp:analyze:${ticket.id}`).setLabel('Analyse').setStyle(ButtonStyle.Secondary),'nv_audit'));
  row.addComponents(mark(new ButtonBuilder().setCustomId(`nvp:close:${ticket.id}`).setLabel('Schließen').setStyle(ButtonStyle.Secondary),'nv_lock'));
  return [row];
}
function partnerBanner(kind){return kind==='change'?'novora-partnership-change.png':kind==='cancel'?'novora-partnership-cancel.png':'novora-partnership-open.png';}
function partnerTicketView(guild,ticket,store){
 const icons=store.state.appEmojis||{};
 const type=ACTIONS[ticket.kind]?.label||'Partnerschaft';
 const state={open:'Wartet auf Bearbeitung',claimed:'In Bearbeitung',approved:'Angenommen',rejected:'Abgelehnt',closed:'Geschlossen'}[ticket.status]||ticket.status;
 const item=`• **CaseID:** \`P-${ticket.id.slice(0,8).toUpperCase()}\`
• **Kategorie:** ${type}
• **Server:** ${esc(ticket.form.server)}
• **Ersteller:** <@${ticket.requesterId}>
• **Status:** ${state}
• **Bearbeiter:** ${ticket.claimedBy?`<@${ticket.claimedBy}>`:'Noch niemand'}`;
 const extras=[];
 if(ticket.form.invite)extras.push(`**Einladung:** ${ticket.form.invite}`);
 if(ticket.form.members)extras.push(`**Mitglieder:** ${ticket.form.members}`);
 if(ticket.form.advert)extras.push(`**Werbung:** ${esc(ticket.form.advert).slice(0,1500)}`);
 if(ticket.analysis)extras.push(`**Novora Analyse:** ${ticket.analysis.score}/100 · ${ticket.analysis.level}`);
 const rows=[...controls(ticket,store).map(r=>r.components),[new ButtonBuilder().setStyle(ButtonStyle.Secondary).setCustomId(`nvp:evidence:${ticket.id}`).setLabel('Datei / Screenshot')]];
 return ui.payload({color:0x42B27A,lines:[
  `# ${ui.customEmoji(icons,'nv_partner','🤝')} Willkommen im ${own(guild.name)} Partnerschafts-Support`,
  ticket.kind==='apply'?'Dein Partnerschaftsantrag ist angekommen. Das Partner-Team prüft deinen Server und meldet sich hier.':ticket.kind==='change'?'Du möchtest deine bestehende Partnerschaft ändern. Das Partner-Team prüft die Angaben und aktualisiert deinen ursprünglichen Forumbeitrag.':'Deine Kündigungsanfrage wurde erfasst. Das Team kümmert sich um die sichere Beendigung deiner Partnerschaft.',
  item,
 ],banner:partnerBanner(ticket.kind),rows,after:[...extras.length?[extras.join('\n\n')]:[], '**Nachweise:** Lade Screenshots oder Dokumente bei Bedarf direkt hier mit **+** hoch. Diese werden im gesicherten Transkript als Anhänge erfasst.']});
}
function tagIcon(store,tier){
  const label=TIERS[tier];if(!label)return '';
  const id=store?.state?.appEmojis?.[label.icon];
  return id?`<:${label.icon}_flat:${id}> `:'';
}
function ticketEmbed(guild,ticket,store){
  const status={open:'Offen',claimed:'Übernommen',approved:'Angenommen',rejected:'Abgelehnt',closed:'Geschlossen'}[ticket.status]||ticket.status;
  const partnerIcon=iconTag(store,'nv_partner','🤝');
  const infoIcon=iconTag(store,'nv_badge','•');
  const teamIcon=iconTag(store,'nv_claim','🛠️');
  const e=new EmbedBuilder().setColor(ticket.status==='approved'?COLORS.approved:ticket.status==='rejected'?COLORS.rejected:ticket.status==='claimed'?COLORS.claimed:COLORS.open)
    .setTitle(`${partnerIcon} ${ACTIONS[ticket.kind].label}`)
    .setDescription(`**${esc(ticket.form.server)}**
Wähle im Ticketbereich die passende Team-Aktion. Nach einer Annahme wird die Partnerschaft automatisch im Forum veröffentlicht.`)
    .addFields(
      {name:`${infoIcon} Status`,value:`**${status}**${ticket.tier?`
${tagIcon(store,ticket.tier)}${TIERS[ticket.tier].label}`:''}`,inline:true},
      {name:'Ansprechpartner',value:`<@${ticket.requesterId}>`,inline:true},
      {name:`${teamIcon} Bearbeitung`,value:ticket.claimedBy?`<@${ticket.claimedBy}>`:'Noch nicht übernommen',inline:true},
      {name:'Einladung',value:ticket.form.invite||'Nicht angegeben',inline:false}
    );
  if(ticket.form.members)e.addFields({name:'Mitglieder',value:ticket.form.members.toLocaleString('de-DE'),inline:true});
  if(ticket.analysis){
    const a=ticket.analysis;
    e.addFields({name:'Novora Analyse',value:`**${a.score}/100 · ${a.level}**
${a.recommendation}`,inline:false});
  }
  if(ticket.form.advert)e.addFields({name:'Serverwerbung',value:esc(ticket.form.advert).slice(0,1000)});
  if(ticket.form.extra)e.addFields({name:'Hinweis / Grund',value:esc(ticket.form.extra).slice(0,450)});
  return e.setTimestamp(ticket.createdAt);
}
function partnerPanel(guild,store){
 const guildName=own(guild.name);
 const icon=ui.customEmoji(store.state.appEmojis,'nv_partner','🤝');
 const count=Object.values(store.state.partnershipTickets||{}).filter(t=>t.guildId===guild.id&&['open','claimed'].includes(t.status)).length;
 return {flags:ui.FLAG,components:[ui.container({color:0x45DB84,lines:[
  `# ${icon} ${guildName} | Partnerschaften`,
  'Du möchtest eine Partnerschaft beantragen, ändern oder beenden? Wähle unten die passende Aktion. Anschließend öffnet sich ein kurzes Formular.',
  'Dein privates Ticket wird vom zuständigen Partnerschaftsteam geprüft. Eine Annahme oder Ablehnung erfolgt niemals automatisch.'
 ],banner:'novora-panel-partnerschaft.png'})],allowedMentions:{parse:[]}};
}
function panelComponents(guildId,store){
  const iconIds=store.state.appEmojis||{};
  const iconNames={apply:'nv_partner',change:'nv_partner_edit',cancel:'nv_partner_end'};
  const options=Object.entries(ACTIONS).map(([value,item])=>{
    const option={label:item.label,description:item.description,value};
    if(iconIds[iconNames[value]])option.emoji={id:iconIds[iconNames[value]],name:iconNames[value]+'_flat'};
    return option;
  });
  return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`nvp:select:${guildId}`).setPlaceholder('Partnerschaftskategorie auswählen').addOptions(options))];
}
function partnerPanelMessage(guild,store){const p=partnerPanel(guild,store);return {...p,components:[...p.components,...panelComponents(guild.id,store)]};}
function buildModal(guildId,kind){
  const action=ACTIONS[kind];if(!action)throw Error('Unbekannte Ticketart');
  const modal=new ModalBuilder().setCustomId(`nvp:form:${kind}:${guildId}`).setTitle(action.label);
  const byKind={
   apply:[
    {id:'server',label:'Name des Discord-Servers',style:TextInputStyle.Short,required:true,max:80},
    {id:'invite',label:'Einladungslink (Discord)',style:TextInputStyle.Short,required:true,max:180},
    {id:'members',label:'Wie viele Mitglieder?',style:TextInputStyle.Short,required:true,max:9},
    {id:'advert',label:'Serverwerbung / Beschreibung',style:TextInputStyle.Paragraph,required:true,max:1000}],
   change:[
    {id:'server',label:'Name deines Partner-Servers',style:TextInputStyle.Short,required:true,max:80},
    {id:'invite',label:'Neuer Einladungslink (optional)',style:TextInputStyle.Short,required:false,max:180},
    {id:'members',label:'Neue Mitgliederzahl (optional)',style:TextInputStyle.Short,required:false,max:9},
    {id:'advert',label:'Neue Werbung (optional)',style:TextInputStyle.Paragraph,required:false,max:1000}],
   cancel:[
    {id:'server',label:'Name deines Partner-Servers',style:TextInputStyle.Short,required:true,max:80},
    {id:'extra',label:'Warum möchtest du kündigen?',style:TextInputStyle.Paragraph,required:true,max:450}]
  };
  const inputs=byKind[kind];
  for(const f of inputs)modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(f.required).setMaxLength(f.max)));
  return modal;
}
function forumContent(ticket,cfg,store){
  // Only the explicitly configured role can be mentioned. Untrusted advertising is not used for mentions.
  const head=cfg.pingRoleId?`<@&${cfg.pingRoleId}>\n`:'';
  const tier=ticket.tier||tierFor(ticket.form.members);
  const label=tier?`${tagIcon(store,tier)}${TIERS[tier].label}`:'Größe noch offen';
  return {content:(head+`**Partnerschaft: ${esc(ticket.form.server)}**\n**Kategorie:** ${label}\n**Mitglieder:** ${ticket.form.members?.toLocaleString('de-DE')||'Nicht angegeben'}\n\n${ticket.form.advert}\n\n**Einladung:** ${ticket.form.invite}\n**Ansprechpartner:** <@${ticket.requesterId}>\n**Bearbeitet von:** <@${ticket.claimedBy}>`).slice(0,1950),allowedMentions:{parse:[],roles:cfg.pingRoleId?[cfg.pingRoleId]:[],users:[]}};
}
async function ensureForumTags(forum){
  const desired=Object.values(TIERS).map(t=>t.forumTag);
  const tags=[...(forum.availableTags||[])];
  const missing=desired.filter(label=>!tags.some(t=>t.name===label));
  const resolved=Object.fromEntries(Object.entries(TIERS).map(([tier,data])=>{
    const found=forum.guild?.emojis?.cache?.find(e=>e.name===data.icon);
    return [data.forumTag,found?.id||null];
  }));
  const needsEmoji=tags.some(t=>resolved[t.name]&&!t.emoji?.id);
  if((missing.length||needsEmoji)&&tags.length+missing.length<=20&&typeof forum.setAvailableTags==='function'){
    const updated=tags.map(t=>resolved[t.name]&&!t.emoji?.id?{...t,emoji:{id:resolved[t.name]}}:t);
    for(const name of missing){const item={name,moderated:true};if(resolved[name])item.emoji={id:resolved[name]};updated.push(item);}
    await forum.setAvailableTags(updated,'Novora Partnerschaftskategorien').catch(()=>{});
  }
  return Object.fromEntries((forum.availableTags||[]).filter(t=>desired.includes(t.name)).map(t=>[t.name,t.id]));
}
function formForChange(existing,changes){
  const form={...existing,...changes};
  for(const key of ['invite','advert','extra'])if(!String(changes[key]||'').trim())form[key]=existing[key];
  if(!changes.members)form.members=existing.members;
  return form;
}
function forumTierTag(tags,tier){const label=TIERS[tier]?.forumTag;return label&&tags[label]?[tags[label]]:[];}
function makePartnerships({client,store,publicUrl}){
  const busy=new Set();
  const commands=[
    new SlashCommandBuilder().setName('partnerschaft-setup').setDescription('Partnerschaftspanel, Team und Forum einrichten (Admin)')
      .addChannelOption(o=>o.setName('panel').setDescription('Kanal für das Auswahlpanel').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o=>o.setName('tickets').setDescription('Kategorie für private Tickets').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption(o=>o.setName('forum').setDescription('Forum für angenommene Partnerschaften').setRequired(true).addChannelTypes(ChannelType.GuildForum))
      .addRoleOption(o=>o.setName('team').setDescription('Rolle der zuständigen Mitarbeiter').setRequired(true))
      .addRoleOption(o=>o.setName('partnerrolle').setDescription('Rolle für angenommene Partner').setRequired(true))
      .addRoleOption(o=>o.setName('pingrolle').setDescription('Rolle bei neuen Partner-Posts erwähnen (optional)').setRequired(false))
      .addChannelOption(o=>o.setName('logkanal').setDescription('Kanal für Ticket-Ereignisse (optional)').setRequired(false).addChannelTypes(ChannelType.GuildText)),
    new SlashCommandBuilder().setName('partnerschaft-panel').setDescription('Sauberes Partnerschafts-Auswahlpanel senden (Admin)'),
    new SlashCommandBuilder().setName('partnerschaft-status').setDescription('Status der Partnerschaftskonfiguration (Admin)'),
    new SlashCommandBuilder().setName('partnerschaft-statistik').setDescription('Partnerschaftskategorien und offene Tickets (Team)'),
    new SlashCommandBuilder().setName('partnerschaft-sync').setDescription('Mitgliederzahlen und Partner-Tags anhand Discord-Einladungen abgleichen (Admin)'),
    new SlashCommandBuilder().setName('partnerschaft-emojis').setDescription('Drei kleine Forum-Tag-Emojis für diesen Server installieren (Admin)')
  ];
  async function log(guild,cfg,ticket,action,userId,note=''){
    recordAudit(store,{guildId:guild.id,actorId:userId,action:'partnership_'+action,details:ticket.form.server+' · '+note});
    if(!cfg.logChannelId)return;
    try{const ch=await guild.channels.fetch(cfg.logChannelId);if(ch?.send)await ch.send({embeds:[new EmbedBuilder().setColor(COLORS.neutral).setTitle('Partnerschaften · '+action).setDescription(`**${esc(ticket.form.server)}**\nTicket-ID: \`${ticket.id.slice(0,12)}\`\nKanal: ${ticket.channelDeletedAt?'gelöscht (ID '+ticket.channelId+')':'<#'+ticket.channelId+'>'}\nAntragsteller: <@${ticket.requesterId}>\nAktion von: <@${userId}>${note?'\n'+esc(note):''}`).setTimestamp()],allowedMentions:{parse:[]}})}catch(err){console.warn('Partnerschaftslog konnte nicht gesendet werden:',err.message)}
  }
  const cfgOf=i=>configFor(store,i.guildId);
  async function setup(interaction){
    if(!interaction.inGuild()||!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))return interaction.reply({content:'Nur Server-Administratoren.',flags:MessageFlags.Ephemeral});
    const names={panelChannel:'panel',ticketCategory:'tickets',forumChannel:'forum',teamRole:'team',partnerRole:'partnerrolle',pingRole:'pingrolle',logChannel:'logkanal'};
    const o={};for(const [key,field] of Object.entries(names))o[key]=key.endsWith('Role')?interaction.options.getRole(field):interaction.options.getChannel(field);
    let settings;try{settings=settingsPayload(interaction.guild,o)}catch(e){return interaction.reply({content:e.message,flags:MessageFlags.Ephemeral})}
    const me=await interaction.guild.members.fetchMe();
    if(!me.permissions.has([PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))return interaction.reply({content:'Dem Bot fehlen Rechte: Manage Channels, Manage Roles, View Channel, Send Messages oder Embed Links.',flags:MessageFlags.Ephemeral});
    if(o.partnerRole.managed||o.partnerRole.position>=me.roles.highest.position)return interaction.reply({content:'Die Partnerrolle liegt über der Bot-Rolle oder ist verwaltet. Bitte Rollenreihenfolge korrigieren.',flags:MessageFlags.Ephemeral});
    for(const ch of [o.panelChannel,o.forumChannel,o.logChannel].filter(Boolean)){
      if(!ch.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))return interaction.reply({content:'Der Bot kann im Kanal '+ch.name+' nicht schreiben.',flags:MessageFlags.Ephemeral});
    }
    const previous=configFor(store,interaction.guildId);
    store.state.partnershipSettings=store.state.partnershipSettings||{};
    store.state.partnershipSettings[interaction.guildId]={...settings,panelMessageId:previous?.panelMessageId||null};
    await store.persist();
    return interaction.reply({content:'**Partnerschaften eingerichtet.**\nPanel: <#'+settings.panelChannelId+'>\nTickets: <#'+settings.ticketCategoryId+'>\nForum: <#'+settings.forumChannelId+'>\nTeam: <@&'+settings.teamRoleId+'>\nPartnerrolle: <@&'+settings.partnerRoleId+'>\nJetzt `/setup` → „Panel veröffentlichen“ wählen.',allowedMentions:{parse:[]},flags:MessageFlags.Ephemeral});
  }
  async function sendPanel(interaction){
    if(!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))return interaction.reply({content:'Nur Server-Administratoren.',flags:MessageFlags.Ephemeral});
    const cfg=cfgOf(interaction);if(!cfg)return interaction.reply({content:'Zuerst `/setup` → „Partnerschaften“ einrichten.',flags:MessageFlags.Ephemeral});
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const ch=await interaction.guild.channels.fetch(cfg.panelChannelId);
    if(!ch?.send||ch.type!==ChannelType.GuildText)return interaction.editReply('Der konfigurierte Panelkanal existiert nicht mehr.');
    let message=null;
    if(cfg.panelMessageId){
      const existing=await ch.messages.fetch(cfg.panelMessageId).catch(()=>null);
      if(existing)message=await ui.publish(ch,decorate(partnerPanelMessage(interaction.guild,store),'partnerschaft',existing,interaction.guild.name),existing);
    }
    if(!message)message=await ch.send(decorate(partnerPanelMessage(interaction.guild,store),'partnerschaft',null,interaction.guild.name));
    cfg.panelMessageId=message.id;await store.persist();
    return interaction.editReply('Partnerschafts-Panel ist aktiv in <#'+ch.id+'>.');
  }
  async function updatePublishedPanel(guild){
    const cfg=configFor(store,guild.id);
    return refreshSavedPanel({guild,channelId:cfg?.panelChannelId,messageId:cfg?.panelMessageId,
      makePayload:old=>decorate(partnerPanelMessage(guild,store),'partnerschaft',old,guild.name),
      onReplaced:async id=>{cfg.panelMessageId=id;await store.persist();}});
  }
  async function installForumEmoji(guild){
    const me=await guild.members.fetchMe();
    const bits=[PermissionFlagsBits.CreateGuildExpressions,PermissionFlagsBits.ManageGuildExpressions].filter(Boolean);
    if(!bits.some(bit=>me.permissions.has(bit)))throw Error('Dem Bot fehlt die Berechtigung „Ausdrücke erstellen“ oder „Ausdrücke verwalten“. Alternativ die drei PNGs in den Servereinstellungen hochladen.');
    const names=[];
    for(const data of Object.values(TIERS)){
      const name=data.icon;
      let existing=guild.emojis.cache.find(e=>e.name===name);
      if(!existing){
        const file=path.join(__dirname,'..','assets','emojis',name+'.png');
        existing=await guild.emojis.create({attachment:file,name,reason:'Novora Partnerschaftsgröße'});
      }
      names.push(existing.name);
    }
    const cfg=configFor(store,guild.id),forum=cfg&&await guild.channels.fetch(cfg.forumChannelId);
    if(forum?.type===ChannelType.GuildForum)await ensureForumTags(forum);
    return names;
  }
  async function refreshPanel(guild,cfg){
    if(!cfg?.panelMessageId)return;
    const ch=await guild.channels.fetch(cfg.panelChannelId).catch(()=>null);
    const msg=await ch?.messages?.fetch(cfg.panelMessageId).catch(()=>null);
    if(msg){const latest=await ui.publish(ch,decorate(partnerPanelMessage(guild,store),'partnerschaft',msg,guild.name),msg);if(latest.id!==msg.id){cfg.panelMessageId=latest.id;await store.persist();}}
  }
  async function openTicket(interaction,kind){
    const cfg=cfgOf(interaction);if(!cfg)throw Error('Der Server hat noch kein Partnerschaftssystem eingerichtet.');
    if(interaction.isModalSubmit()===false)throw Error('Ungültiges Formular');
    const fields=Object.fromEntries(['server','invite','members','advert','extra'].map(k=>{let value='';try{value=interaction.fields.getTextInputValue(k);}catch{}return [k,value];}));
    const form=validateForm(kind,fields);
    let verifiedInvite=false;
    // Discord invite may have expired; never reject older cancellation requests based on it.
    if(form.invite){
      try{await client.fetchInvite(form.inviteKey);verifiedInvite=true;}
      catch{throw Error('Die Discord-Einladung ist ungültig oder abgelaufen.')}
    }
    const existing=Object.values(tickets(store)).find(t=>t.guildId===interaction.guildId&&t.requesterId===interaction.user.id&&t.kind===kind&&['open','claimed'].includes(t.status));
    if(existing)throw Error('Du hast bereits ein offenes Ticket dieser Art: <#'+existing.channelId+'>');
    if(kind!=='apply'){
      const record=Object.values(partners(store)).find(r=>r.guildId===interaction.guildId&&r.requesterId===interaction.user.id&&r.status==='active'&&r.server.toLowerCase()===form.server.toLowerCase());
      if(!record)throw Error('Für diesen Namen ist keine aktive Partnerschaft unter deinem Discord-Konto gespeichert. Kontaktiere das Team.');
    }
    const lockKey=interaction.guildId+':'+interaction.user.id+':'+kind;
    if(busy.has(lockKey))throw Error('Dein Formular wird bereits verarbeitet.');
    busy.add(lockKey);
    try{
      const roleId=cfg.teamRoleId,botId=client.user.id,requesterId=interaction.user.id;
      const topic='Novora Partnerschaft | '+kind+' | '+requesterId;
      const channel=await interaction.guild.channels.create({name:`${ACTIONS[kind].prefix}-${nameSlug(form.server)}`.slice(0,90),type:ChannelType.GuildText,parent:cfg.ticketCategoryId,topic,
        permissionOverwrites:[
          {id:interaction.guildId,deny:[PermissionFlagsBits.ViewChannel]},
          {id:requesterId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
          {id:roleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
          {id:botId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.EmbedLinks]}
        ],reason:'Novora Partnerships: privates Ticket für '+requesterId});
      const prior=kind==='apply'?null:Object.values(partners(store)).find(r=>r.guildId===interaction.guildId&&r.requesterId===requesterId&&r.status==='active'&&r.server.toLowerCase()===form.server.toLowerCase());
      const effective=prior?formForChange(prior,form):form;
      const tier=tierFor(effective.members);
      const analysis=kind==='cancel'?null:scorePartnership(effective,{inviteVerified:verifiedInvite||!!prior?.inviteVerified});
      const ticket={id:randomUUID().replace(/-/g,'').slice(0,20),guildId:interaction.guildId,channelId:channel.id,requesterId,kind,form,status:'open',claimedBy:null,createdAt:Date.now(),updatedAt:Date.now(),forumThreadId:null,tier,analysis,inviteVerified:verifiedInvite||!!prior?.inviteVerified};
      tickets(store)[ticket.id]=ticket;
      try{await store.persist();const banner=partnerBanner(ticket.kind);const partnerPayload=partnerTicketView(interaction.guild,ticket,store);partnerPayload.components[0].components.unshift(ui.text(`<@&${roleId}> · <@${requesterId}>`));partnerPayload.allowedMentions={roles:[roleId],users:[requesterId]};
      const msg=await channel.send({...partnerPayload,files:[new AttachmentBuilder(path.join(__dirname,'..','assets','banners',banner),{name:banner})]});ticket.headerMessageId=msg.id;await store.persist();}
      catch(e){delete tickets(store)[ticket.id];await store.persist().catch(()=>{});await channel.delete().catch(()=>{});throw e;}
      await log(interaction.guild,cfg,ticket,'erstellt',requesterId);
      return channel;
    }finally{busy.delete(lockKey)}
  }
  async function safeRole(guild,roleId,userId,add){
    const member=await guild.members.fetch(userId),bot=await guild.members.fetchMe(),role=await guild.roles.fetch(roleId);
    if(!role||role.managed||role.id===guild.id||role.position>=bot.roles.highest.position||!bot.permissions.has(PermissionFlagsBits.ManageRoles))return 'Partnerrolle konnte wegen Rollenrechten nicht '+(add?'vergeben':'entfernt')+' werden.';
    if(add)await member.roles.add(role,'Novora Partnerschaft genehmigt');else await member.roles.remove(role,'Novora Partnerschaft beendet');
    return '';
  }
  async function updateNickname(guild,ticket,record,add){
    const bot=await guild.members.fetchMe();if(!bot.permissions.has(PermissionFlagsBits.ManageNicknames))return;
    const member=await guild.members.fetch(ticket.requesterId).catch(()=>null);
    if(!member||member.id===guild.ownerId||member.roles.highest.position>=bot.roles.highest.position)return;
    const current=member.nickname||member.user.globalName||member.user.username;
    const suffix=' · Partner';
    if(add){if(current.endsWith(suffix))return; record.previousNickname=member.nickname;await member.setNickname((current.slice(0,32-suffix.length).trimEnd()+suffix).slice(0,32),'Novora Partnerschaft').catch(()=>{});}
    else if(current.endsWith(suffix))await member.setNickname(record.previousNickname??null,'Novora Partnerschaft beendet').catch(()=>{});
  }
  async function approval(guild,cfg,ticket){
    const identity=ticket.guildId+':'+ticket.requesterId+':'+ticket.form.server.toLowerCase();
    const entries=partners(store);
    let record=entries[identity];
    if(ticket.kind==='apply'){
      if(record?.status==='active')throw Error('Für diesen Antragsteller und Server besteht bereits eine aktive Partnerschaft.');
      const forum=await guild.channels.fetch(cfg.forumChannelId);
      if(!forum||forum.type!==ChannelType.GuildForum)throw Error('Das Partnerschaftsforum wurde nicht gefunden.');
      const tags=await ensureForumTags(forum);
      const entry=forumContent(ticket,cfg,store);
      const thread=await forum.threads.create({name:own(ticket.form.server).slice(0,90),message:entry,appliedTags:forumTierTag(tags,ticket.tier),reason:'Novora Partnerschaft angenommen'});
      ticket.forumThreadId=thread.id;
      record={id:identity,guildId:ticket.guildId,requesterId:ticket.requesterId,server:ticket.form.server,forumThreadId:thread.id,createdAt:Date.now(),status:'active',...ticket.form,tier:ticket.tier,analysis:ticket.analysis,inviteVerified:ticket.inviteVerified,claimedBy:ticket.claimedBy};
      entries[identity]=record;await store.persist();
      const warning=await safeRole(guild,cfg.partnerRoleId,ticket.requesterId,true).catch(e=>'Partnerrolle nicht gesetzt: '+e.message);
      await updateNickname(guild,ticket,record,true);await store.persist();
      return warning||'Forumbeitrag erstellt und Partnerrolle zugewiesen.';
    }
    if(!record||record.status!=='active')throw Error('Aktive Partnerschaft für diesen Antragsteller und Server nicht gefunden.');
    const thread=await guild.channels.fetch(record.forumThreadId);
    if(ticket.kind==='change'){
      if(!thread?.send)throw Error('Forumbeitrag nicht mehr vorhanden.');
      const merged=formForChange(record,ticket.form),tier=tierFor(merged.members);
      const current={...ticket,form:merged,tier};
      const payload=forumContent(current,{...cfg,pingRoleId:null},store);
      // Replace the original starter, not just append outdated details.
      const starter=await thread.fetchStarterMessage().catch(()=>null);
      if(!starter?.edit)throw Error('Der Forum-Startbeitrag ist nicht bearbeitbar; Änderungen wurden nicht übernommen.');
      await starter.edit({content:payload.content,allowedMentions:{parse:[]}});
      const forum=await guild.channels.fetch(cfg.forumChannelId);
      const tags=forum?.type===ChannelType.GuildForum?await ensureForumTags(forum):{};
      if(thread.setAppliedTags && forumTierTag(tags,tier).length){
        const oldTierNames=new Set(Object.values(TIERS).map(t=>t.forumTag));
        const removed=new Set((forum.availableTags||[]).filter(t=>oldTierNames.has(t.name)).map(t=>t.id));
        const remaining=(thread.appliedTags||[]).filter(t=>!removed.has(t));
        await thread.setAppliedTags([...remaining,...forumTierTag(tags,tier)].slice(0,5),'Novora Partnergröße aktualisiert');
      }
      record.invite=merged.invite;record.advert=merged.advert;record.extra=merged.extra;record.claimedBy=ticket.claimedBy;
      record.members=merged.members;record.tier=tier;record.updatedAt=Date.now();
      record.analysis=scorePartnership(merged,{inviteVerified:ticket.inviteVerified||record.inviteVerified});
      record.inviteVerified=!!(ticket.inviteVerified||record.inviteVerified);
      ticket.form=merged;ticket.tier=tier;ticket.analysis=record.analysis;
      await store.persist();
      return 'Forum-Startbeitrag, Mitgliederzahl, Größen-Tag und Analyse aktualisiert.';
    }
    if(ticket.kind==='cancel'){
      if(thread?.send)await thread.send({content:'**Partnerschaft beendet.** Dieser Beitrag wird archiviert.',allowedMentions:{parse:[]}}).catch(()=>{});
      if(thread?.setArchived)await thread.setArchived(true,'Novora Partnerschaft beendet').catch(()=>{});
      const other=Object.values(entries).some(r=>r!==record&&r.guildId===ticket.guildId&&r.requesterId===ticket.requesterId&&r.status==='active');
      let warning='';
      if(!other){warning=await safeRole(guild,cfg.partnerRoleId,ticket.requesterId,false).catch(e=>'Partnerrolle nicht entfernt: '+e.message);await updateNickname(guild,ticket,record,false)}
      record.status='ended';record.endedAt=Date.now();await store.persist();
      return warning||'Partnerschaft archiviert und Partnerrechte überprüft.';
    }
    throw Error('Ungültiger Vorgang');
  }
  async function refreshCounts(guildId=null,limit=30){
    const result={checked:0,updated:0,errors:0};
    const items=Object.values(partners(store)).filter(p=>p.status==='active'&&p.invite&&(!guildId||p.guildId===guildId)).slice(0,Math.min(100,Math.max(1,limit)));
    const touched=new Set();
    for(const record of items){
      try{
        const guild=client.guilds.cache.get(record.guildId),cfg=guild&&configFor(store,record.guildId);
        if(!cfg)continue;
        const check=await client.fetchInvite(record.invite,{withCounts:true});
        result.checked++;
        const count=check?.approximateMemberCount;
        if(!Number.isSafeInteger(count)||count<1||count===record.members)continue;
        const tier=tierFor(count);
        const thread=await guild.channels.fetch(record.forumThreadId);
        const forum=await guild.channels.fetch(cfg.forumChannelId);
        if(!thread?.fetchStarterMessage||forum?.type!==ChannelType.GuildForum)throw Error('Forumbeitrag fehlt');
        const message=await thread.fetchStarterMessage();
        const changed={...record,members:count,tier};
        const payload=forumContent({form:changed,requesterId:record.requesterId,claimedBy:record.claimedBy||record.requesterId,tier}, {...cfg,pingRoleId:null},store);
        await message.edit({content:payload.content,allowedMentions:{parse:[]}});
        const tags=await ensureForumTags(forum);
        if(thread.setAppliedTags&&forumTierTag(tags,tier).length){
          const categoryIds=new Set((forum.availableTags||[]).filter(t=>Object.values(TIERS).some(x=>x.forumTag===t.name)).map(t=>t.id));
          const other=(thread.appliedTags||[]).filter(id=>!categoryIds.has(id));
          await thread.setAppliedTags([...other,...forumTierTag(tags,tier)].slice(0,5),'Automatischer Größenabgleich');
        }
        record.members=count;record.tier=tier;record.updatedAt=Date.now();record.lastCountCheck=Date.now();
        record.analysis=scorePartnership(record,{inviteVerified:true});record.inviteVerified=true;
        await store.persist();result.updated++;touched.add(record.guildId);
      }catch(e){result.errors++;console.warn('Partnerzahlen-Abgleich:',String(e.message).slice(0,120));}
    }
    for(const gid of touched){const guild=client.guilds.cache.get(gid);if(guild)await refreshPanel(guild,configFor(store,gid)).catch(()=>{});}
    return result;
  }
  async function ticketAction(interaction,action,ticketId){
    if(!interaction.inGuild())throw Error('Nur im Discord-Server möglich.');
    const cfg=cfgOf(interaction),ticket=tickets(store)[ticketId];
    if(!cfg||!ticket||ticket.guildId!==interaction.guildId||interaction.channelId!==ticket.channelId)throw Error('Dieses Ticket existiert hier nicht.');
    const member=await interaction.guild.members.fetch(interaction.user.id);
    if(!assertStaff(member,cfg,interaction.guild))throw Error('Nur das zuständige Server-Team darf Tickets bearbeiten.');
    if(busy.has(ticketId))throw Error('Eine andere Aktion wird gerade bearbeitet.');
    busy.add(ticketId);
    try{
      let actionNote='';
      if(ticket.status==='closed')throw Error('Ticket bereits geschlossen.');
      if(action==='analyze'){
        if(ticket.status!=='open'&&ticket.status!=='claimed')throw Error('Dieses Ticket ist bereits entschieden.');
        // Review only replies written by the applicant in this private ticket; never archive raw chat text.
        const recent=await interaction.channel.messages.fetch({limit:50}).catch(()=>new Map());
        const notes=[...recent.values()].filter(m=>m.author?.id===ticket.requesterId&&!m.author?.bot).map(m=>String(m.content||'')).join('\n').slice(0,6000);
        ticket.analysis=scorePartnership(ticket.form,{inviteVerified:ticket.inviteVerified,applicantNotes:notes});
        ticket.updatedAt=Date.now();await store.persist();
        const msg=await interaction.channel.messages.fetch(ticket.headerMessageId).catch(()=>null);
        if(msg){const next=await ui.publish(interaction.channel,{...partnerTicketView(interaction.guild,ticket,store),files:[new AttachmentBuilder(path.join(__dirname,'..','assets','banners',partnerBanner(ticket.kind)),{name:partnerBanner(ticket.kind)})],attachments:[]},msg);if(next.id!==msg.id){ticket.headerMessageId=next.id;await store.persist();}}
        return 'Analyse aktualisiert: '+ticket.analysis.score+'/100 ('+ticket.analysis.level+'). Nur eine Entscheidungshilfe.';
      }
      if(action==='claim'){
        if(ticket.requesterId===member.id)throw Error('Du kannst deine eigene Partnerschaftsanfrage nicht übernehmen.');
        if(ticket.status!=='open')throw Error('Dieses Ticket wurde bereits übernommen.');
        ticket.claimedBy=member.id;ticket.status='claimed';
      }else if(action==='release'){
        if(ticket.status!=='claimed')throw Error('Ticket ist nicht übernommen.');
        if(ticket.claimedBy!==member.id&&!member.permissions.has(PermissionFlagsBits.Administrator)&&interaction.guild.ownerId!==member.id)throw Error('Nur Bearbeiter oder Administrator dürfen freigeben.');
        ticket.claimedBy=null;ticket.status='open';
      }else if(action==='approve'||action==='reject'){
        if(ticket.status!=='claimed')throw Error('Bitte das Ticket zunächst übernehmen.');
        if(ticket.claimedBy!==member.id&&!member.permissions.has(PermissionFlagsBits.Administrator)&&interaction.guild.ownerId!==member.id)throw Error('Nur die übernehmende Person oder ein Administrator kann entscheiden.');
        if(action==='approve'){actionNote=await approval(interaction.guild,cfg,ticket);ticket.status='approved';}
        else ticket.status='rejected';
      }else if(action==='close'){
        if(!['open','claimed','approved','rejected'].includes(ticket.status))throw Error('Ticket nicht schließbar');
        if(!interaction.channel?.delete)throw Error('Ticketkanal nicht löschbar.');
        const closedAt=Date.now();
        // A failed or incomplete transcript must not delete the ticket channel.
        const transcript=await archiveTicket({store:{...store,publicUrl},channel:interaction.channel,guild:interaction.guild,
          ticket,kind:'partnership-'+ticket.kind,actorId:member.id,closedAt});
        try{await interaction.channel.delete('Novora: Partnerschaftstranskript vollständig gesichert');}
        catch(e){throw Error('Transkript wurde gesichert, der Kanal konnte aber nicht gelöscht werden: '+e.message);}
        ticket.previousStatus=ticket.status;ticket.status='closed';ticket.endedAt=closedAt;ticket.closedBy=member.id;
        ticket.channelDeletedAt=Date.now();ticket.updatedAt=Date.now();ticket.lastActorId=member.id;
        await store.persist();
        const user=await client.users.fetch(ticket.requesterId).catch(()=>null);
        if(user?.send){
          const url=tokenUrl(publicUrl,transcript.token);
          const description=`• **Case-ID:** \`P-${ticket.id.slice(0,8).toUpperCase()}\`\n• **Kategorie:** ${ACTIONS[ticket.kind].label}\n• **Bearbeitet von:** <@${member.id}>\n• **Erstellt:** <t:${Math.floor(ticket.createdAt/1000)}:f>\n• **Geschlossen:** <t:${Math.floor(closedAt/1000)}:f>\n• **Nachrichten:** ${transcript.count}`;
          const link=url?[new ButtonBuilder().setLabel('Zum Online-Transkript').setStyle(ButtonStyle.Link).setURL(url)]:[];
          await user.send({...ui.payload({color:0x4A9A83,lines:[
            `# ${ui.customEmoji(store.state.appEmojis,'nv_partner','🤝')} Dein Partnerschaftsticket wurde geschlossen`,
            `Dein Ticket auf **${own(interaction.guild.name)}** wurde sicher archiviert.`, description,
            'Den vollständigen Ticketverlauf kannst du über den geschützten Transkript-Link öffnen.'
          ],banner:'novora-partnership-open.png',rows:link.length?[link]:[]}),
          files:[new AttachmentBuilder(path.join(__dirname,'..','assets','banners','novora-partnership-open.png'),{name:'novora-partnership-open.png'})]}).catch(()=>{});
          const starButtons=[1,2,3,4,5].map(n=>new ButtonBuilder().setCustomId(`nvp:stars:${ticket.id}:${n}`).setLabel('★'.repeat(n)).setStyle(ButtonStyle.Secondary));
          await user.send(ui.payload({color:0x6574DC,lines:[
            '# Bewerte das Partnerschaftsteam',
            'Wie zufrieden warst du? Wähle einen bis fünf Sterne. Dein Feedback wird nur intern protokolliert.'
          ],rows:[starButtons]})).catch(()=>{});
        }
        await log(interaction.guild,cfg,ticket,action,member.id,`Transkript archiviert (${transcript.count} Nachrichten) · ${tokenUrl(publicUrl,transcript.token)||'lokal'}`);
        await refreshPanel(interaction.guild,cfg).catch(()=>{});
        return 'Partnerschaftsticket geschlossen, Verlauf gesichert und Ticketkanal gelöscht.';
      }else throw Error('Unbekannte Aktion');
      ticket.updatedAt=Date.now();ticket.lastActorId=member.id;
      await store.persist();
      // Update the persistent ticket header rather than relying on the clicked stale button message.
      if(action==='approve'||action==='close')await refreshPanel(interaction.guild,cfg).catch(()=>{});
      let msg=await interaction.channel.messages.fetch(ticket.headerMessageId).catch(()=>null);
      if(msg){const next=await ui.publish(interaction.channel,{...partnerTicketView(interaction.guild,ticket,store),files:[new AttachmentBuilder(path.join(__dirname,'..','assets','banners',partnerBanner(ticket.kind)),{name:partnerBanner(ticket.kind)})],attachments:[]},msg);if(next.id!==msg.id){ticket.headerMessageId=next.id;await store.persist();}}
      await log(interaction.guild,cfg,ticket,action,member.id,actionNote);
      return `Aktion **${action==='claim'?'Übernommen':action==='release'?'Freigegeben':action==='approve'?'Angenommen':action==='reject'?'Abgelehnt':'Geschlossen'}** ausgeführt.${actionNote?' '+actionNote:''}`;
    }finally{busy.delete(ticketId)}
  }
  async function onInteraction(interaction){
    try{
      if(interaction.isChatInputCommand()){
        if(!commands.some(c=>c.name===interaction.commandName))return false;
        if(!interaction.inGuild())return interaction.reply({content:'Nur auf einem Discord-Server verfügbar.',flags:MessageFlags.Ephemeral}),true;
        if(interaction.commandName==='partnerschaft-setup')await setup(interaction);
        if(interaction.commandName==='partnerschaft-panel')await sendPanel(interaction);
        if(interaction.commandName==='partnerschaft-emojis'){
          if(!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))return interaction.reply({content:'Nur Server-Administratoren.',flags:MessageFlags.Ephemeral}),true;
          await interaction.deferReply({flags:MessageFlags.Ephemeral});
          const names=await installForumEmoji(interaction.guild);
          await interaction.editReply('Drei flache Server-Emojis für Forum-Tags eingerichtet: '+names.join(', '));
          return true;
        }
        if(interaction.commandName==='partnerschaft-sync'){
          if(!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))return interaction.reply({content:'Nur Server-Administratoren.',flags:MessageFlags.Ephemeral}),true;
          await interaction.deferReply({flags:MessageFlags.Ephemeral});
          const r=await refreshCounts(interaction.guildId,50);
          await interaction.editReply(`Mitgliederzahlen geprüft: ${r.checked} · Aktualisiert: ${r.updated} · Fehler: ${r.errors}. Die Werte von Discord sind ungefähre Mitgliederzahlen.`);
          return true;
        }
        if(interaction.commandName==='partnerschaft-statistik'){
          const cfg=cfgOf(interaction);
          const member=await interaction.guild.members.fetch(interaction.user.id);
          if(!cfg||!assertStaff(member,cfg,interaction.guild))return interaction.reply({content:'Nur das Partnerschaftsteam.',flags:MessageFlags.Ephemeral}),true;
          const stats=tierCount(partners(store),interaction.guildId);
          const open=Object.values(tickets(store)).filter(t=>t.guildId===interaction.guildId&&['open','claimed'].includes(t.status));
          return interaction.reply({content:`**Novora · Partnerschaftsstatistik**\nAktiv: **${stats.active}**\n${tagIcon(store,'small')}Klein: **${stats.small}**\n${tagIcon(store,'medium')}Mittel: **${stats.medium}**\n${tagIcon(store,'large')}Groß: **${stats.large}**\nOffene Tickets: **${open.length}**\nAutomatische Bewerbungswerte sind nur Entscheidungshilfen.`,flags:MessageFlags.Ephemeral}),true;
        }
        if(interaction.commandName==='partnerschaft-status'){
          if(!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))return interaction.reply({content:'Nur Server-Administratoren.',flags:MessageFlags.Ephemeral}),true;
          const cfg=cfgOf(interaction);
          await interaction.reply({content:cfg?`**Partnerschaften eingerichtet**\nPanel: <#${cfg.panelChannelId}>\nTicket-Kategorie: <#${cfg.ticketCategoryId}>\nForum: <#${cfg.forumChannelId}>\nTeam: <@&${cfg.teamRoleId}>\nPartnerrolle: <@&${cfg.partnerRoleId}>\nOffen: ${Object.values(tickets(store)).filter(t=>t.guildId===interaction.guildId&&['open','claimed'].includes(t.status)).length}`:'Noch nicht eingerichtet. Nutze `/partnerschaft-setup`.',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
        }
        return true;
      }
      if(!(interaction.isStringSelectMenu()||interaction.isButton()||interaction.isModalSubmit())||!interaction.customId?.startsWith('nvp:'))return false;
      const parts=interaction.customId.split(':');
      if(parts[1]==='stars'&&interaction.isButton()){
        const ticket=tickets(store)[parts[2]],score=Number(parts[3]);
        if(!ticket||ticket.status!=='closed'||ticket.requesterId!==interaction.user.id)throw Error('Nur der Antragsteller kann ein geschlossenes Partnerschaftsticket bewerten.');
        if(!Number.isInteger(score)||score<1||score>5)throw Error('Ungültige Sternebewertung.');
        store.state.partnershipRatings ||= {};
        if(store.state.partnershipRatings[ticket.id])throw Error('Dieses Ticket wurde bereits bewertet.');
        store.state.partnershipRatings[ticket.id]={guildId:ticket.guildId,requesterId:ticket.requesterId,staffId:ticket.claimedBy||null,stars:score,at:Date.now()};
        await store.persist();
        const guild=client.guilds.cache.get(ticket.guildId),cfg=configFor(store,ticket.guildId);
        if(guild&&cfg)await log(guild,cfg,ticket,'bewertet',interaction.user.id,`${score}/5 Sterne · Bearbeiter ${ticket.claimedBy||'nicht zugewiesen'}`);
        await interaction.update(ui.payload({color:0x459A77,lines:['# Vielen Dank für deine Bewertung!', '★'.repeat(score)+' · Dein Feedback wurde sicher gespeichert.']}));
        return true;
      }
      if(!interaction.inGuild())throw Error('Nur im Server verfügbar');
      if(parts[1]==='select'){
        if(parts[2]!==interaction.guildId)throw Error('Panel gehört zu einem anderen Server.');
        const kind=interaction.values[0];if(!ACTIONS[kind])throw Error('Unbekannte Ticketart');
        // Discord keeps the former StringSelect selection until components are refreshed.
        // Reset the persistent panel before opening the modal, so the same kind can be selected again.
        const panel=panelComponents(interaction.guildId,store);
        // A modal must acknowledge the interaction promptly; edit the panel afterwards.
        await interaction.showModal(buildModal(interaction.guildId,kind));
        await interaction.message.edit({components:partnerPanelMessage(interaction.guild,store).components,flags:ui.FLAG}).catch(e=>console.warn('Partner-Menü zurücksetzen:',e.message));
        return true;
      }
      if(parts[1]==='evidence'&&interaction.isButton()){
        const ticket=tickets(store)[parts[2]];
        if(!ticket||ticket.guildId!==interaction.guildId||ticket.channelId!==interaction.channelId)throw Error('Ticket gehört nicht zu diesem Kanal.');
        const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null),cfg=cfgOf(interaction);
        if(ticket.requesterId!==interaction.user.id&&!assertStaff(member,cfg,interaction.guild))throw Error('Nur Ticketbeteiligte können Anhänge hinzufügen.');
        await interaction.reply({content:'📎 **Datei anhängen:** Tippe unten im privaten Ticket auf **+** und wähle dein Bild, Video oder Dokument. Es wird direkt im Kanal hochgeladen und im Transkript als Anhang erfasst.',flags:MessageFlags.Ephemeral});return true;
      }
      if(parts[1]==='form'){
        if(parts[3]!==interaction.guildId)throw Error('Falscher Server');
        await interaction.deferReply({flags:MessageFlags.Ephemeral});
        const ch=await openTicket(interaction,parts[2]);
        await interaction.editReply(ui.payload({color:0x36B578,lines:['# ✅ Deine Partnerschaftsanfrage wurde erstellt','Dein privates Partnerschaftsticket ist bereit.'],rows:[[new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Zum Ticket').setURL(`https://discord.com/channels/${interaction.guildId}/${ch.id}`)]]}));
        return true;
      }
      if(['claim','release','approve','reject','close','analyze'].includes(parts[1])){
        await interaction.deferReply({flags:MessageFlags.Ephemeral});
        const text=await ticketAction(interaction,parts[1],parts[2]);
        await interaction.editReply(text);return true;
      }
      throw Error('Unbekannte Aktion');
    }catch(e){
      const msg='Partnerschaften: '+String(e.message||'Unbekannter Fehler').slice(0,250);
      if(interaction.deferred||interaction.replied)await interaction.editReply({content:msg}).catch(()=>{});
      else await interaction.reply({content:msg,flags:MessageFlags.Ephemeral}).catch(()=>{});
      return true;
    }
  }
  return {commands,onInteraction,setup,sendPanel,updatePublishedPanel,installForumEmoji,settingsPayload,refreshCounts,configFor:gid=>configFor(store,gid)};
}
module.exports={ACTIONS,own,inviteCode,validateForm,settingsPayload,assertStaff,buildModal,forumContent,ensureForumTags,formForChange,partnerBanner,partnerPanel,partnerTicketView,partnerPanelMessage,makePartnerships};
