'use strict';
const {decorate}=require('./panel-art');
const {buildSupportLog}=require('./support-log-panel');
const ui=require('./ui-v2');
const {refreshSavedPanel}=require('./panel-sync');
// Novora Support 3.6: independent module; no external LLM, no message surveillance.
const {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder
}=require('discord.js');
const { randomUUID, randomBytes }=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const { recordAudit }=require('./control');
const {archiveTicket,tokenUrl}=require('./ticket-archive');
const {QUESTIONS,fieldsFor,normalizeSubmission}=require('./support-questions');
const {sendPrivateForm}=require('./form-messages');

const KINDS=Object.freeze({question:'Allgemeiner Support',rules:'Regel- & RP-Fragen',player:'Spieler melden',technical:'Technischer Support',report:'Team-Beschwerde'});
const STAGES=Object.freeze({question:['Gelöst markieren','Lösung bestätigt'],rules:['Regelauskunft geprüft','Regelauskunft geprüft'],player:['Beweise geprüft','Beweislage geprüft'],technical:['Fehler reproduziert','Fehler bestätigt'],report:['Beschwerde gesichtet','Beschwerde vertraulich gesichtet']});
const COLORS=Object.freeze({waiting:0x66758C,active:0x3C78B8,closed:0x3C9673,warning:0xD48A47});
const ts=t=>`<t:${Math.floor(t/1000)}:R>`;
const clean=(v,max=350)=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/@everyone|@here/g,'[Erwähnung]').slice(0,max).trim();
const slug=v=>clean(v,35).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\-]/g,'-').replace(/-+/g,'-').replace(/(^-|-$)/g,'')||'user';

function emojiTag(emojis,name,fallback=''){
  return emojis?.[name]?`<:${name}_flat:${emojis[name]}>`:fallback;
}
function serverName(guild){return clean(guild?.name||'Server',70).replace(/<a?:[\w-]+:\d+>/g,'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').replace(/\s+/g,' ').trim()||'Community';}
function transcriptUrl(baseUrl,token){
  if(!baseUrl||!token)return null;
  return String(baseUrl).replace(/\/$/,'')+'/transcript?token='+encodeURIComponent(token);
}
const pref=store=>{
  store.state.supportSettings ||= {};
  store.state.supportTickets ||= {};
  store.state.supportVoiceCases ||= {};
  store.state.supportRatings ||= [];
  return store.state;
};
function staff(member,guild,teamRoleId){
  return Boolean(member&&guild&&(member.id===guild.ownerId||member.permissions?.has(PermissionFlagsBits.Administrator)||member.roles?.cache?.has(teamRoleId)));
}
function ticketConfig(opts){
  const panel=opts.panel, category=opts.category, team=opts.team, logs=opts.logs;
  if(panel?.type!==ChannelType.GuildText||category?.type!==ChannelType.GuildCategory||!team?.id)
    throw Error('Ticket-Setup benötigt Text-Panel, Ticket-Kategorie und Teamrolle.');
  if(Boolean(opts.complaints)!==Boolean(opts.complaintsTeam))throw Error('Für vertrauliche Beschwerden bitte sowohl private Kategorie als auch Beschwerde-Teamrolle konfigurieren.');
  return {panelId:panel.id,categoryId:category.id,teamRoleId:team.id,complaintsCategoryId:opts.complaints?.id||null,complaintsRoleId:opts.complaintsTeam?.id||null,logId:logs?.id||null,ratingsId:opts.ratings?.id||null,panelMessageId:null};
}
function voiceConfig(opts){
  const waiting=opts.waiting, notification=opts.notification, template=opts.template, team=opts.team;
  if(waiting?.type!==ChannelType.GuildVoice||notification?.type!==ChannelType.GuildText||template?.type!==ChannelType.GuildVoice||!team?.id)
    throw Error('Voice-Setup benötigt Sprach-Warteraum, Benachrichtigungskanal, Sprachraum-Vorlage und Teamrolle.');
  if(waiting.id===template.id)throw Error('Warteraum und Support-Vorlage müssen unterschiedliche Kanäle sein.');
  return {waitingId:waiting.id,notificationId:notification.id,templateId:template.id,teamRoleId:team.id,
    ratingsId:opts.ratings?.id||null,logsId:opts.logs?.id||null};
}
const stars=n=>'★'.repeat(Math.max(1,Math.min(5,n)))+'☆'.repeat(5-Math.max(1,Math.min(5,n)));
function ticketPanel(guild,cfg,counts,emojis={}){
 const id=key=>emojis[key]?{id:emojis[key],name:key+'_flat'}:undefined;
 const opts=[
  {label:'Allgemeiner Support',value:'question',description:'Allgemeine Fragen oder Probleme rund um den Server',emoji:id('nv_support')},
  {label:'Regel- & RP-Fragen',value:'rules',description:'Fragen zu Regeln, Roleplay und Abläufen',emoji:id('nv_rules')},
  {label:'Spieler melden',value:'player',description:'Regelverstöße und Verhalten melden',emoji:id('nv_report')},
  {label:'Technischer Support',value:'technical',description:'Bots, Rollen, Verifizierung und Technik',emoji:id('nv_technical')},
  {label:'Team-Beschwerde',value:'report',description:cfg?.complaintsCategoryId&&cfg?.complaintsRoleId?'Vertrauliche Meldung zum Server-Team':'Private Beschwerdestelle muss eingerichtet werden',emoji:id('nv_team')}
 ].map(o=>{if(!o.emoji)delete o.emoji;return o});
 const menu=new StringSelectMenuBuilder().setCustomId(`nvs:choose:${guild.id}`).setPlaceholder('Wähle eine Kategorie …').addOptions(...opts);
 const marker=ui.customEmoji(emojis,'nv_ticket','🎟️');
 return {flags:ui.FLAG,components:[ui.container({color:0x5C5AD6,lines:[
   `# ${marker} ${serverName(guild)} | Support`,
   'Du benötigst Hilfe, hast eine Frage oder möchtest etwas melden? Wähle unten die passende Kategorie für dein Anliegen aus. Anschließend wird automatisch ein privates Ticket erstellt, in dem sich unser Team um dich kümmert.',
   'Bitte wähle die Kategorie, die am besten zu deinem Anliegen passt, damit wir dir möglichst schnell helfen können.'
 ],banner:'novora-panel-tickets.png'}),ui.categoryRow(menu)],allowedMentions:{parse:[]}};
}
function ticketView(ticket,emojis={},guildName=""){
 const status=ticket.status==='closed'?'Geschlossen':ticket.status==='claimed'?'Übernommen':'Wartet auf ein Teammitglied';
 const icon=ui.customEmoji(emojis,'nv_ticket','🎟️');
 const topic=ui.safe?ui.safe(ticket.title,80):clean(ticket.title,80);
 const audienceNote={question:'Unser Team hilft dir bei deinem Anliegen.',rules:'Deine Regelfrage wird mit Blick auf das Regelwerk beantwortet.',player:'Wir prüfen deine Spielermeldung sachlich. Bitte ergänze Nachweise, falls vorhanden.',technical:'Wir versuchen das Problem nachzustellen. Bitte teile keine Passwörter oder geheimen Zugangsdaten.',report:'Deine Team-Beschwerde wird vertraulich geprüft. Weitere Unterlagen kannst du hier ergänzen.'};
 return ui.payload({color:QUESTIONS[ticket.kind]?.color||0xE29A25,lines:[
   `# ${icon} Willkommen im ${guildName?serverName({name:guildName})+" ":""}Support`,
   'Vielen Dank, dass du ein Ticket erstellt hast. Ein zuständiges Teammitglied wird sich so schnell wie möglich um dein Anliegen kümmern.',
   audienceNote[ticket.kind]||'Bitte beschreibe dein Anliegen möglichst genau und hab etwas Geduld.',
   `• **CaseID:** \`T-${ticket.id.slice(0,8).toUpperCase()}\`
• **Kategorie:** ${KINDS[ticket.kind]||'Support'}
• **Ersteller:** <@${ticket.userId}>
• **Status:** ${status}
• **Prüfung:** ${ticket.workflowStage||'Noch ausstehend'}
• **Bearbeiter:** ${ticket.staffId?`<@${ticket.staffId}>`:'Noch niemand'}
• **Erstellt:** ${ts(ticket.createdAt)}`
 ],banner:'novora-ticket-open.png',rows:ticketActions(ticket,emojis).map(r=>r.components),after:[
  '**Screenshots, Videos oder Dokumente:** Du kannst sie hier im privaten Chat mit **+** als Datei anhängen. Sie werden als Anhänge im Ticket-Transkript erfasst. Teile keine Passwörter oder Tokens.'
 ]});
}
function ticketActions(ticket,emojis={}){
  if(ticket.status==='closed')return [];
  const row=new ActionRowBuilder();
  if(ticket.status==='open')row.addComponents(new ButtonBuilder().setCustomId(`nvs:tclaim:${ticket.id}`).setLabel('Übernehmen').setStyle(ButtonStyle.Success).setEmoji(emojis.nv_claim?{id:emojis.nv_claim,name:'nv_claim_flat'}:'✅'));
  if(ticket.status==='claimed')row.addComponents(new ButtonBuilder().setCustomId(`nvs:trelease:${ticket.id}`).setLabel('Freigeben').setStyle(ButtonStyle.Secondary).setEmoji(emojis.nv_release?{id:emojis.nv_release,name:'nv_release_flat'}:'↩️'));
  if(ticket.status==='claimed'&&!ticket.workflowStage)row.addComponents(new ButtonBuilder().setCustomId(`nvs:tstage:${ticket.id}`).setLabel(STAGES[ticket.kind]?.[0]||'Geprüft').setStyle(ButtonStyle.Secondary));
  if(!ticket.closeRequestedBy)row.addComponents(new ButtonBuilder().setCustomId(`nvs:trequest:${ticket.id}`).setLabel('Schließungs-Anfrage').setStyle(ButtonStyle.Secondary).setEmoji(emojis.nv_question?{id:emojis.nv_question,name:'nv_question_flat'}:'❔'));
  if(ticket.closeRequestedBy)row.addComponents(new ButtonBuilder().setCustomId(`nvs:tdecline:${ticket.id}`).setLabel('Anfrage ablehnen').setStyle(ButtonStyle.Secondary).setEmoji(emojis.nv_denied?{id:emojis.nv_denied,name:'nv_denied_flat'}:'✖️'));
  row.addComponents(new ButtonBuilder().setCustomId(`nvs:tevidence:${ticket.id}`).setLabel('Datei / Screenshot').setStyle(ButtonStyle.Secondary));
  row.addComponents(new ButtonBuilder().setCustomId(`nvs:tclose:${ticket.id}`).setLabel('Schließen').setStyle(ButtonStyle.Danger).setEmoji(emojis.nv_close?{id:emojis.nv_close,name:'nv_close_flat'}:'✖️'));
  return [row];
}
function voiceNotice(c,channel,emojis={}){
 const label=c.status==='waiting'?'Wartet auf Support':c.status==='active'?'Im Gespräch':c.status==='cancelled'?'Anfrage verlassen':'Support beendet';
 const icon=ui.customEmoji(emojis,'nv_voice','🎧');
 const start=c.status==='active'?(c.startedAt||c.createdAt):c.createdAt;
 const buttons=[];
 if(c.status==='waiting')buttons.push(new ButtonBuilder().setCustomId('nvs:vclaim:'+c.id).setLabel('Übernehmen').setStyle(ButtonStyle.Primary).setEmoji(emojis.nv_claim?{id:emojis.nv_claim,name:'nv_claim_flat'}:'✅'));
 if(c.status==='active')buttons.push(new ButtonBuilder().setCustomId('nvs:vclose:'+c.id).setLabel('Beenden').setStyle(ButtonStyle.Secondary).setEmoji(emojis.nv_close?{id:emojis.nv_close,name:'nv_close_flat'}:'✖️'));
 return ui.payload({color:c.status==='active'?0x4B7CE8:0x5B5AD5,lines:[
  `# ${icon} Voice-Support | ${label}`,
  `**Mitglied:** <@${c.userId}>
**${c.status==='waiting'?'Wartet seit':c.status==='active'?'Gespräch seit':'Anfrage seit'}:** ${ts(start)}
**Supporter:** ${c.staffId?`<@${c.staffId}>`:'Noch nicht übernommen'}
**Raum:** ${c.roomId?`<#${c.roomId}>`:`<#${channel}>`}`
 ],rows:buttons.length?[buttons]:[],after:c.endedAt?[`**Dauer:** ${Math.max(0,Math.floor((c.endedAt-start)/1000))} Sekunden`]:[]});
}
function ratingModal(caseId,kind){
  const modal=new ModalBuilder().setCustomId(`nvs:rateform:${kind}:${caseId}`).setTitle(kind==='public'?'Support bewerten':'Privates Feedback an das Team');
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stars').setLabel('Sterne (1 bis 5)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(1).setRequired(true).setPlaceholder('5')));
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comment').setLabel(kind==='public'?'Öffentlicher Kommentar (optional)':'Was kann das Team verbessern?').setStyle(TextInputStyle.Paragraph).setMaxLength(700).setRequired(false)));
  if(kind==='private')modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Interne Hinweise (nur für das Team)').setStyle(TextInputStyle.Paragraph).setMaxLength(700).setRequired(false)));
  return modal;
}
function makeSupportSuite({client,store,publicUrl}){
  const activeLocks=new Set(), s=pref(store);
  const config=gid=>s.supportSettings[gid]||{};
  const cases=()=>Object.values(s.supportVoiceCases);
  const tickets=()=>Object.values(s.supportTickets);
  function checkTeam(guild,member,team){if(!staff(member,guild,team))throw Error('Nur das zuständige Server-Team darf diese Aktion ausführen.');}
  async function log(guild,channelId,text){
    if(!channelId)return; const ch=await guild.channels.fetch(channelId).catch(()=>null);
    if(ch?.send)await ch.send(buildSupportLog(text)).catch(()=>{});
  }
  async function editTicket(guild,ticket){
    const ch=await guild.channels.fetch(ticket.channelId).catch(()=>null);
    const msg=await ch?.messages?.fetch(ticket.messageId).catch(()=>null);
    if(msg){const current={...ticketView(ticket,store.state.appEmojis||{},guild.name),files:[new AttachmentBuilder(path.join(__dirname,'..','assets','banners','novora-ticket-open.png'),{name:'novora-ticket-open.png'})],attachments:[]};const result=await ui.publish(ch,current,msg);if(result.id!==msg.id){ticket.messageId=result.id;await store.persist();}}
  }
  async function refreshTicketPanel(guild){
    const cfg=config(guild.id).tickets;if(!cfg?.panelMessageId)return;
    const ch=await guild.channels.fetch(cfg.panelId).catch(()=>null);
    const msg=await ch?.messages?.fetch(cfg.panelMessageId).catch(()=>null);
    if(msg){const updated=await ui.publish(ch,decorate(ticketPanel(guild,cfg,tickets().filter(t=>t.guildId===guild.id&&t.status!=='closed').length,store.state.appEmojis||{}),'tickets',msg,guild.name),msg);if(updated.id!==msg.id){cfg.panelMessageId=updated.id;await store.persist();}}
  }
  async function updatePublishedPanel(guild){
    const cfg=config(guild.id).tickets;
    return refreshSavedPanel({guild,channelId:cfg?.panelId,messageId:cfg?.panelMessageId,
      makePayload:old=>decorate(ticketPanel(guild,cfg,tickets().filter(t=>t.guildId===guild.id&&t.status!=='closed').length,store.state.appEmojis||{}),'tickets',old,guild.name),
      onReplaced:async id=>{cfg.panelMessageId=id;await store.persist();}});
  }
  async function setupTickets(i){
    checkTeam(i.guild,await i.guild.members.fetch(i.user.id),'__admin_only__');
    const cfg=ticketConfig({panel:i.options.getChannel('panel'),category:i.options.getChannel('kategorie'),team:i.options.getRole('team'),complaints:i.options.getChannel('beschwerden'),complaintsTeam:i.options.getRole('beschwerdeteam'),logs:i.options.getChannel('logs'),ratings:i.options.getChannel('bewertungen')});
    if(cfg.teamRoleId===i.guildId)throw Error('Die @everyone-Rolle darf keine Support-Teamrolle sein.');
    const previous=config(i.guildId).tickets||{};s.supportSettings[i.guildId]={...config(i.guildId),tickets:{...cfg,panelMessageId:previous.panelId===cfg.panelId?previous.panelMessageId:null}};
    await store.persist();return i.reply({content:'Ticket-System eingerichtet. Öffne `/setup` → „Panel veröffentlichen“ und wähle Tickets.',flags:MessageFlags.Ephemeral});
  }
  async function setupVoice(i){
    checkTeam(i.guild,await i.guild.members.fetch(i.user.id),'__admin_only__');
    const cfg=voiceConfig({waiting:i.options.getChannel('warteraum'),notification:i.options.getChannel('benachrichtigung'),template:i.options.getChannel('vorlage'),team:i.options.getRole('team'),ratings:i.options.getChannel('bewertungen'),logs:i.options.getChannel('logs')});
    if(cfg.teamRoleId===i.guildId)throw Error('Die @everyone-Rolle darf keine Voice-Teamrolle sein.');
    const me=await i.guild.members.fetchMe();
    if(!me.permissions.has([PermissionFlagsBits.ManageChannels,PermissionFlagsBits.MoveMembers,PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw Error('Bot benötigt Kanäle verwalten, Mitglieder verschieben, Kanäle ansehen und Nachrichten senden.');
    s.supportSettings[i.guildId]={...config(i.guildId),voice:cfg};await store.persist();
    return i.reply({content:`Voice-Support aktiv.\nWartekanal: <#${cfg.waitingId}>\nBenachrichtigungen: <#${cfg.notificationId}>\nVorlage: <#${cfg.templateId}>\nNeue Anfragen werden in derselben Nachricht aktualisiert.`,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  }
  async function sendTicketPanel(i){
    checkTeam(i.guild,await i.guild.members.fetch(i.user.id),'__admin_only__');
    const cfg=config(i.guildId).tickets;if(!cfg)throw Error('Zuerst `/setup` → „Ticket-System“ einrichten.');
    const ch=await i.guild.channels.fetch(cfg.panelId);
    if(!ch?.send)throw Error('Panel-Kanal fehlt.');
    const payload=ticketPanel(i.guild,cfg,tickets().filter(t=>t.guildId===i.guildId&&t.status!=='closed').length,store.state.appEmojis||{});
    let msg=cfg.panelMessageId?await ch.messages.fetch(cfg.panelMessageId).catch(()=>null):null;
    if(cfg.panelMessageId&&!msg)throw Error('Gespeichertes Ticket-Panel fehlt. Kein zweites Panel veröffentlicht; bitte die alte Registrierung bewusst zurücksetzen.');
    msg=await ui.publish(ch,decorate(payload,'tickets',msg,i.guild.name),msg);
    cfg.panelMessageId=msg.id;await store.persist();
    return i.reply({content:`Ticket-Panel aktualisiert: <#${cfg.panelId}> (keine neue Nachricht bei vorhandenem Panel).`,flags:MessageFlags.Ephemeral});
  }
  function ticketModal(gid,kind){
    if(!KINDS[kind])throw Error('Ticketart unbekannt.');
    const modal=new ModalBuilder().setCustomId(`nvs:tform:${gid}:${kind}`).setTitle(KINDS[kind]);
    for(const [id,label,style,required,max] of fieldsFor(kind))
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(id).setLabel(label).setStyle(style==='paragraph'?TextInputStyle.Paragraph:TextInputStyle.Short).setMaxLength(max).setRequired(required)));
    return modal;
  }
  async function openTicket(i,kind){
    const lockId='open:'+i.guildId+':'+i.user.id;
    if(activeLocks.has(lockId))throw Error('Deine Ticketanfrage wird bereits bearbeitet.');
    activeLocks.add(lockId);
    try{
    const cfg=config(i.guildId).tickets;if(!cfg)throw Error('Tickets sind noch nicht eingerichtet.');
    if(!KINDS[kind])throw Error('Unbekannte Ticketart.');
    if(kind==='report'&&(!cfg.complaintsCategoryId||!cfg.complaintsRoleId))throw Error('Vertrauliche Beschwerden benötigen eine separate Kategorie und Teamrolle. Bitte in /setup einrichten.');
    if(tickets().some(t=>t.guildId===i.guildId&&t.userId===i.user.id&&t.status!=='closed'))throw Error('Du hast bereits ein offenes Ticket.');
    const me=await i.guild.members.fetchMe();if(!me.permissions.has(PermissionFlagsBits.ManageChannels))throw Error('Bot benötigt „Kanäle verwalten“.');
    const answers=normalizeSubmission(kind,Object.fromEntries(fieldsFor(kind).map(([id])=>{let value='';try{value=i.fields.getTextInputValue(id)}catch{}return [id,value];})));
    const {title,description,priority}=answers;
    if(!title&&!description)throw Error('Bitte kurz dein Anliegen beschreiben.');
    const t={id:randomUUID(),guildId:i.guildId,userId:i.user.id,kind,title:title||KINDS[kind],description,priority,answers,status:'open',createdAt:Date.now(),staffId:null,channelId:null,messageId:null};
    const targetRole=kind==='report'&&cfg.complaintsRoleId?cfg.complaintsRoleId:cfg.teamRoleId;
    const targetCategory=kind==='report'&&cfg.complaintsCategoryId?cfg.complaintsCategoryId:cfg.categoryId;
    const ch=await i.guild.channels.create({name:'ticket-'+kind+'-'+slug(i.user.username).slice(0,16),type:ChannelType.GuildText,parent:targetCategory,
      permissionOverwrites:[{id:i.guild.id,deny:[PermissionFlagsBits.ViewChannel]},
        {id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
        {id:targetRole,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
        {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels]}],reason:'Novora Support Ticket'});
    t.channelId=ch.id;
    try{
      const banner='novora-ticket-open.png';
      const ticketPayload=ticketView(t,store.state.appEmojis||{},i.guild.name);ticketPayload.components[0].components.unshift(ui.text(`<@&${targetRole}> · <@${i.user.id}>`));ticketPayload.allowedMentions={roles:[targetRole],users:[i.user.id]};
      const m=await ch.send({...ticketPayload,files:[new AttachmentBuilder(path.join(__dirname,'..','assets','banners',banner),{name:banner})]});
      // Preserve the user's submitted form visibly inside the private case,
      // analogous to the separate 'Eröffnungs-Formular' section in the reference.
      const formLines=['# '+emojiTag(store.state.appEmojis||{},'nv_transcript','📋')+' '+KINDS[kind]+' · Eröffnungsformular'];
      for(const [field,label] of fieldsFor(kind))if(answers[field])formLines.push('**'+label+'**\n'+clean(answers[field],1750));
      formLines.push('---\n**Hinweis für das Team**\n'+QUESTIONS[kind].guidance);
      await sendPrivateForm(ch,formLines,{color:0x5964D6});
      t.messageId=m.id;s.supportTickets[t.id]=t;
      try{await store.persist();}catch(e){
        // A failed commit must not leave a phantom open ticket in memory.
        delete s.supportTickets[t.id];
        throw e;
      }
      // The private ticket is now durable. A broken public panel must never
      // cause its deletion or strand the requester with a phantom ticket.
      await refreshTicketPanel(i.guild).catch(e=>console.warn('Ticket-Panel konnte nach Eröffnung nicht aktualisiert werden:',e.message));
      await log(i.guild,cfg.logId,`Ticket eröffnet · ${KINDS[kind]} · ${t.id} · User ${i.user.id}`);
      return ch;
    }catch(e){
      // Only failed creation/commit is eligible for cleanup. A committed ticket
      // is never removed due to a later panel/logging problem.
      if(s.supportTickets[t.id]!==t)await ch.delete('Ticket-Erstellung fehlgeschlagen').catch(()=>{});
      throw e;
    }
    }finally{activeLocks.delete(lockId)}
  }
  async function onTicketMessage(message){
    // Message content is available only with Discord's enabled Message Content
    // intent. Never infer a substantive staff answer from an empty payload.
    if(!message?.guild||message.author?.bot||message.system||!message.author?.id)return false;
    const text=String(message.content||'').trim();
    if(text.length<12||!/[\\p{L}\\p{N}]/u.test(text)||/^[!/.]/.test(text))return false;
    const ticket=tickets().find(t=>t.guildId===message.guild.id&&t.channelId===message.channelId&&t.status==='open');
    if(!ticket||ticket.userId===message.author.id)return false;
    const cfg=config(message.guild.id).tickets;
    if(!cfg)return false;
    const member=message.member||await message.guild.members.fetch(message.author.id).catch(()=>null);
    const teamRole=ticket.kind==='report'&&cfg.complaintsRoleId?cfg.complaintsRoleId:cfg.teamRoleId;
    if(!staff(member,message.guild,teamRole))return false;
    try{
      await actionTicket(message.guild,message.author.id,ticket.id,'claim');
      return true;
    }catch(err){
      // Concurrent messages and manual claims must not create another owner
      // or a duplicate announcement. Unexpected storage errors are surfaced.
      if(/Ticket wird bereits bearbeitet|Bereits übernommen|Ticket bereits geschlossen/.test(err.message))return false;
      throw err;
    }
  }
  async function actionTicket(guild,actor,ticketId,action){
    const t=s.supportTickets[ticketId];if(!t||t.guildId!==guild.id)throw Error('Ticket nicht gefunden.');
    const cfg=config(guild.id).tickets;if(!cfg)throw Error('Ticket-Konfiguration fehlt.');
    const member=await guild.members.fetch(actor).catch(()=>null);
    if(action==='request'){
      if(t.userId!==actor)throw Error('Nur die betroffene Person kann eine Schließung anfragen.');
      if(t.status==='closed')throw Error('Ticket bereits geschlossen.');
      if(t.closeRequestedBy)throw Error('Die Schließung wurde bereits angefragt.');
      t.closeRequestedBy=actor;await store.persist();await editTicket(guild,t);
      const channel=await guild.channels.fetch(t.channelId).catch(()=>null);
      const roleId=t.kind==='report'&&cfg.complaintsRoleId?cfg.complaintsRoleId:cfg.teamRoleId;
      if(channel?.send)await channel.send({content:`<@&${roleId}> · Die betroffene Person möchte das Ticket schließen. Bitte prüfen.`,allowedMentions:{roles:[roleId]}}).catch(()=>{});
      return {ok:true,ticket:t,status:t.status};
    }
    checkTeam(guild,member,t.kind==='report'&&cfg.complaintsRoleId?cfg.complaintsRoleId:cfg.teamRoleId);
    if(t.userId===actor&&['claim','release'].includes(action))throw Error('Du kannst dein eigenes Ticket nicht übernehmen.');
    if(activeLocks.has('t'+ticketId))throw Error('Ticket wird bereits bearbeitet.');
    activeLocks.add('t'+ticketId);
    try{
      if(t.status==='closed')throw Error('Ticket bereits geschlossen.');
      if(action==='stage'){
        if(t.status!=='claimed')throw Error('Bitte zuerst das Ticket übernehmen.');
        if(t.staffId!==actor&&!member.permissions?.has(PermissionFlagsBits.Administrator))throw Error('Nur der zuständige Bearbeiter darf den Bearbeitungsschritt bestätigen.');
        if(t.workflowStage)throw Error('Der Prüfschritt wurde bereits bestätigt.');
        t.workflowStage=STAGES[t.kind]?.[1]||'Geprüft';
        t.workflowCheckedAt=Date.now();await store.persist();await editTicket(guild,t);
      }else if(action==='claim'){
        if(t.userId===actor)throw Error('Du kannst dein eigenes Ticket nicht übernehmen.');
        if(t.status!=='open')throw Error('Bereits übernommen.');
        // Commit the claim before announcing it. If persistence fails, restore
        // the in-memory ticket so another team member can retry safely.
        const before={staffId:t.staffId,status:t.status,claimedAt:t.claimedAt};
        t.staffId=actor;t.status='claimed';t.claimedAt=Date.now();
        try{await store.persist();}catch(err){Object.assign(t,before);throw err;}
        const roleId=t.kind==='report'&&cfg.complaintsRoleId?cfg.complaintsRoleId:cfg.teamRoleId;
        const teamRole=member.roles?.cache?.get(roleId)||guild.roles?.cache?.get(roleId);
        const roleName=actor===guild.ownerId?'Owner':member.permissions?.has(PermissionFlagsBits.Administrator)?'Administrator':(teamRole?.name||'Teammitglied');
        const safeName=value=>clean(value,70).replace(/[*_`~|<>]/g,'');
        const displayName=safeName(member.displayName||member.user?.globalName||member.user?.username||actor);
        const channel=await guild.channels.fetch(t.channelId).catch(()=>null);
        if(channel?.send)await channel.send({content:`${safeName(roleName)} ${displayName} hat das Ticket übernommen.`,allowedMentions:{parse:[]}}).catch(err=>console.warn('Ticket-Übernahmemeldung:',err.message));
        await editTicket(guild,t).catch(err=>console.warn('Ticket-Panel nach Übernahme:',err.message));
        await log(guild,cfg.logId,`Ticket übernommen · ${t.id} · User ${t.userId} · Team ${actor}`);
      }else if(action==='decline'){
        if(!t.closeRequestedBy)throw Error('Keine Schließungs-Anfrage vorhanden.');
        t.closeRequestedBy=null;
        await store.persist();await editTicket(guild,t);
      }else if(action==='release'){
        if(t.status!=='claimed')throw Error('Dieses Ticket ist nicht übernommen.');
        if(t.staffId!==actor&&actor!==guild.ownerId&&!member.permissions.has(PermissionFlagsBits.Administrator))throw Error('Nur Bearbeiter oder Administrator können die Übernahme freigeben.');
        t.staffId=null;t.claimedAt=null;t.status='open';
        await store.persist();await editTicket(guild,t);
        await log(guild,cfg.logId,`Ticket freigegeben · ${t.id} · Team ${actor}`);
      }else if(action==='close'){
        // Fail closed: archive and securely index the FULL readable transcript before deleting.
        const ch=await guild.channels.fetch(t.channelId).catch(()=>null);
        if(!ch?.delete)throw Error('Ticket-Kanal nicht mehr erreichbar; keine Löschung durchgeführt.');
        const previousStatus=t.status;
        const closedAt=Date.now();
        const transcript=await archiveTicket({store:{...store,publicUrl},channel:ch,guild,ticket:t,kind:'ticket',actorId:actor,closedAt});
        try{await ch.delete('Novora: Tickettranskript vollständig gesichert, Ticket geschlossen');}
        catch(err){throw Error('Transkript gesichert, aber der Kanal konnte nicht gelöscht werden: '+err.message);}
        t.status='closed';t.endedAt=closedAt;t.closedBy=actor;t.previousStatus=previousStatus;t.channelDeletedAt=Date.now();
        await store.persist();
        try{await requestRating(guild,t,'ticket');}catch(e){console.warn('Bewertungs-DM fehlgeschlagen:',e.message)}
        await log(guild,cfg.logId,`Ticket geschlossen · ${t.id} · User ${t.userId} · Team ${actor} · Nachrichten ${transcript.count} · Transkript ${tokenUrl(publicUrl,transcript.token)||'lokal gespeichert'}`);
      }else throw Error('Unbekannte Aktion.');
      await refreshTicketPanel(guild).catch(e=>console.warn('Ticket-Panel aktualisieren:',e.message));
      recordAudit(store,{guildId:guild.id,actorId:actor,action:'support_ticket_'+action,details:t.id});
      return {ok:true,ticket:t,status:t.status};
    }finally{activeLocks.delete('t'+ticketId)}
  }
  async function editVoice(guild,c){
    const cfg=config(guild.id).voice;if(!cfg)return;
    const ch=await guild.channels.fetch(cfg.notificationId).catch(()=>null);
    const msg=await ch?.messages?.fetch(c.messageId).catch(()=>null);
    if(msg)await msg.edit(voiceNotice(c,cfg.waitingId,store.state.appEmojis)).catch(e=>console.warn('Voice-Karte:',e.message));
  }
    async function voiceJoin(oldState,newState){
    const guild=newState.guild||oldState.guild;const cfg=config(guild.id).voice;
    if(!cfg||newState.member?.user?.bot||oldState.member?.user?.bot)return;
    const userId=newState.id||oldState.id;
    // Once a user leaves their waiting room, expire only their still-waiting request.
    const waiting=cases().find(x=>x.guildId===guild.id&&x.userId===userId&&x.status==='waiting');
    if(waiting&&oldState.channelId===cfg.waitingId&&newState.channelId!==cfg.waitingId){
      waiting.status='cancelled';waiting.endedAt=Date.now();await store.persist();await editVoice(guild,waiting);
    }
    // Closing is strictly tied to the requester's departure from their active call.
    const active=cases().find(x=>x.guildId===guild.id&&x.userId===userId&&x.status==='active');
    if(active&&oldState.channelId===active.roomId&&newState.channelId!==active.roomId){
      await finishVoice(guild,active,'Nutzer hat den Support verlassen');
    }
    if(newState.channelId===cfg.waitingId&&oldState.channelId!==cfg.waitingId){
      const lockId='waiting:'+guild.id+':'+userId;
      if(activeLocks.has(lockId))return;
      activeLocks.add(lockId);
      try{
        if(cases().some(x=>x.guildId===guild.id&&x.userId===userId&&['waiting','active','transferring'].includes(x.status)))return;
        const c={id:randomUUID(),guildId:guild.id,userId,status:'waiting',createdAt:Date.now(),messageId:null,roomId:null,staffId:null};
        const ch=await guild.channels.fetch(cfg.notificationId).catch(()=>null);if(!ch?.send)return;
        const msg=await ch.send(voiceNotice(c,cfg.waitingId,store.state.appEmojis));
        // If the user left while Discord was sending the notification, do not leave a stale request.
        const requester=await guild.members.fetch(userId).catch(()=>null);
        if(requester?.voice?.channelId!==cfg.waitingId){
          c.status='cancelled';c.endedAt=Date.now();
          await msg.edit(voiceNotice(c,cfg.waitingId,store.state.appEmojis)).catch(()=>{});
        }
        c.messageId=msg.id;s.supportVoiceCases[c.id]=c;await store.persist();
        await log(guild,cfg.logsId,'Voice-Support-Anfrage · '+c.id+' · User '+userId);
      }finally{activeLocks.delete(lockId)}
    }
  }
  function allocateName(guild,template,cfg){
    const m=template.name.match(/^(.*?)(\d+)?$/u);const base=clean(m?.[1]||template.name,65).replace(/[- #]+$/,'')||'Support';
    const originals=[...guild.channels.cache.values()].filter(ch=>ch.type===ChannelType.GuildVoice&&ch.parentId===template.parentId);
    const regex=new RegExp('^'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[ -]?(\\d+)$','i');
    const taken=new Set(originals.map(ch=>{const v=ch.name.match(regex);return v?Number(v[1]):0}));
    for(let n=1;n<=99;n++)if(!taken.has(n))return `${base} ${String(n).padStart(2,'0')}`;
    return `${base} ${Date.now().toString().slice(-5)}`;
  }
  async function claimVoice(guild,actor,caseId){
    const c=s.supportVoiceCases[caseId];if(!c||c.guildId!==guild.id)throw Error('Voice-Anfrage nicht gefunden.');
    const cfg=config(guild.id).voice;if(!cfg)throw Error('Voice-Support nicht eingerichtet.');
    const supporter=await guild.members.fetch(actor).catch(()=>null);checkTeam(guild,supporter,cfg.teamRoleId);
    if(activeLocks.has('v'+caseId))throw Error('Wird bereits übernommen.');
    activeLocks.add('v'+caseId);
    let newlyCreated=null;
    try{
      if(c.status!=='waiting')throw Error('Diese Anfrage wartet nicht mehr.');
      const user=await guild.members.fetch(c.userId).catch(()=>null);
      if(user?.voice?.channelId!==cfg.waitingId)throw Error('Das Mitglied ist nicht mehr im Warteraum.');
      if(!supporter?.voice?.channelId)throw Error('Verbinde dich zuerst mit einem Sprachkanal, damit Novora dich verschieben kann.');
      const me=await guild.members.fetchMe();if(!me.permissions.has([PermissionFlagsBits.ManageChannels,PermissionFlagsBits.MoveMembers]))throw Error('Bot benötigt Kanäle verwalten und Mitglieder verschieben.');
      const template=await guild.channels.fetch(cfg.templateId);if(!template||template.type!==ChannelType.GuildVoice)throw Error('Support-Vorlage nicht vorhanden.');
      // Reuse only bot-managed idle rooms; never silently change an unrelated public room's permissions.
      let room=null;
      for(const previous of cases().filter(x=>x.guildId===guild.id&&x.status==='closed'&&x.roomId&&x.managed)){
        const candidate=await guild.channels.fetch(previous.roomId).catch(()=>null);
        if(candidate?.type===ChannelType.GuildVoice&&candidate.id!==cfg.templateId&&candidate.members.size===0&&candidate.permissionOverwrites?.set){
          // Fully reset all old permission overrides before a new guest enters this room.
          // Avoid accidentally giving a former visitor permanent access.
          const updated=await candidate.permissionOverwrites.set([
            {id:guild.id,deny:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:cfg.teamRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:c.userId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:actor,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.MoveMembers]}
          ]).then(()=>true,()=>false);
          if(updated){room=candidate;break;}
        }
      }
      if(!room){
        room=await guild.channels.create({name:allocateName(guild,template,cfg),type:ChannelType.GuildVoice,parent:template.parentId,
          bitrate:template.bitrate,userLimit:template.userLimit===1?2:template.userLimit,rtcRegion:template.rtcRegion||undefined,
          permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:cfg.teamRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:c.userId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:actor,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},
            {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.MoveMembers]}],
          reason:'Novora · Privater Voice-Support'});
        newlyCreated=room;
      }
      const original=supporter.voice.channelId;
      c.status='transferring';
      try {
        await user.voice.setChannel(room,'Novora Support · Anfrage übernommen');
        await supporter.voice.setChannel(room,'Novora Support · Team übernimmt');
      } catch(moveError) {
        c.status='waiting';
        if(user.voice.channelId===room.id)await user.voice.setChannel(cfg.waitingId,'Support-Übernahme zurückgesetzt').catch(()=>{});
        throw moveError;
      }
      c.status='active';c.staffId=actor;c.roomId=room.id;c.startedAt=Date.now();c.staffOriginalRoomId=original;c.managed=true;
      await store.persist();await editVoice(guild,c);
      await log(guild,cfg.logsId,`Voice-Support übernommen · ${c.id} · User ${c.userId} · Team ${actor} · Raum ${room.id}`);
      return {ok:true,roomId:room.id,case:c};
    }catch(e){if(newlyCreated)await newlyCreated.delete('Voice-Support nicht gestartet').catch(()=>{});throw e;}
    finally{activeLocks.delete('v'+caseId)}
  }
  async function requestRating(guild,c,kind){
    const user=await client.users.fetch(c.userId).catch(()=>null);if(!user)return;
    const time=c.endedAt||Date.now(),started=c.claimedAt||c.startedAt||c.createdAt;
    const duration=Math.max(0,Math.floor((time-started)/1000));
    const link=kind==='ticket'?tokenUrl(publicUrl,c.transcriptToken):null;
    const buttons=[];
    if(link)buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('Zum Online-Transkript').setEmoji(store.state.appEmojis?.nv_transcript?{id:store.state.appEmojis.nv_transcript,name:'nv_transcript_flat'}:'📄'));
    const starsRow=[1,2,3,4,5].map(n=>new ButtonBuilder().setCustomId(`nvs:stars:${c.id}:${n}`).setLabel('★'.repeat(n)).setStyle(ButtonStyle.Secondary));
    const feedbackRow=[new ButtonBuilder().setCustomId(`nvs:rate:private:${c.id}`).setLabel('Privates Feedback').setStyle(ButtonStyle.Secondary).setEmoji(store.state.appEmojis?.nv_privaterating?{id:store.state.appEmojis.nv_privaterating,name:'nv_privaterating_flat'}:'✉️')];
    await user.send(ui.payload({color:0x6560CE,lines:[
      '# Dein Ticket wurde geschlossen!',
      `Dein ${kind==='ticket'?'Support-Ticket':'Voice-Support'} auf **${clean(guild.name,70)}** wurde beendet. Vielen Dank für dein Vertrauen!`,
      `• **CaseID:** \`${String(c.id).slice(0,12)}\`
• **Kategorie:** ${kind==='ticket'?(KINDS[c.kind]||'Support'):'Voice-Support'}
• **Bearbeitung:** ${Math.floor(duration/60)}m ${duration%60}s
• **Bearbeitet von:** ${c.staffId?`<@${c.staffId}>`:'Team'}
• **Erstellt:** ${ts(c.createdAt)}
• **Geschlossen:** ${ts(time)}`,
      'Den Verlauf dieses Tickets kannst du online nachlesen. Wie hat dir der Support gefallen?'
     ],rows:[...(buttons.length?[buttons]:[]),starsRow,feedbackRow]})).catch(e=>console.warn('Support Abschluss-DM fehlgeschlagen:',e.message));
  }
  async function finishVoice(guild,c,reason){
    if(c.status!=='active')return {ok:true,already:true};
    if(activeLocks.has('finish'+c.id))return {ok:true,busy:true};
    activeLocks.add('finish'+c.id);
    try{
      c.status='closed';c.endedAt=Date.now();c.endReason=reason;
      await store.persist();await editVoice(guild,c);
      const cfg=config(guild.id).voice;
      const staffMember=await guild.members.fetch(c.staffId).catch(()=>null);
      const room=await guild.channels.fetch(c.roomId).catch(()=>null);
      if(staffMember?.voice?.channelId===c.roomId){
        // Continue with the oldest actually waiting requester, otherwise return to the origin.
        let handedOff=false;
        const next=cases().filter(x=>x.guildId===guild.id&&x.status==='waiting').sort((a,b)=>a.createdAt-b.createdAt)[0];
        if(next){
          try{
            await claimVoice(guild,c.staffId,next.id);
            next.staffOriginalRoomId=c.staffOriginalRoomId;
            await store.persist();handedOff=true;
          }catch(err){console.warn('Nächsten Support nicht automatisch übernommen:',err.message)}
        }
        if(!handedOff){
          const target=c.staffOriginalRoomId;
          const safeTarget=target&&target!==c.roomId?await guild.channels.fetch(target).catch(()=>null):null;
          if(safeTarget?.type===ChannelType.GuildVoice)await staffMember.voice.setChannel(safeTarget,'Novora Support · Fall beendet').catch(()=>{});
        }
      }
      // Wait briefly only to let Discord voice-state events resolve; do not delete occupied channels.
      if(room?.type===ChannelType.GuildVoice&&c.managed){
        const fresh=await guild.channels.fetch(room.id).catch(()=>null);
        if(fresh?.members?.size===0)await fresh.delete('Novora · Support beendet').catch(()=>{});
      }
      await requestRating(guild,c,'voice');
      await log(guild,cfg?.logsId,`Voice-Support beendet · ${c.id} · User ${c.userId} · Team ${c.staffId} · ${clean(reason,180)}`);
      return {ok:true,case:c};
    }finally{activeLocks.delete('finish'+c.id)}
  }
  async function rating(i,type,id){
    const c=s.supportTickets[id]||s.supportVoiceCases[id];if(!c||c.userId!==i.user.id)throw Error('Nur die betroffene Person darf bewerten.');
    if(c.status!=='closed')throw Error('Bewertung erst nach Abschluss möglich.');
    if(s.supportRatings.some(r=>r.caseId===id&&r.kind===type))throw Error('Diese Bewertung wurde bereits abgegeben.');
    const starsNumber=Number(i.fields.getTextInputValue('stars'));
    if(!Number.isInteger(starsNumber)||starsNumber<1||starsNumber>5)throw Error('Bitte eine Zahl von 1 bis 5 eingeben.');
    const r={id:randomUUID(),caseId:id,guildId:c.guildId,userId:i.user.id,staffId:c.staffId||null,kind:type,stars:starsNumber,
      comment:clean(i.fields.getTextInputValue('comment'),700),details:type==='private'?clean(i.fields.getTextInputValue('details'),700):'',createdAt:Date.now(),
      waitSeconds:c.startedAt?Math.floor((c.startedAt-c.createdAt)/1000):null,durationSeconds:c.endedAt&&c.startedAt?Math.floor((c.endedAt-c.startedAt)/1000):null};
    s.supportRatings.push(r);if(s.supportRatings.length>2000)s.supportRatings.splice(0,s.supportRatings.length-2000);
    await store.persist();
    const guild=client.guilds.cache.get(c.guildId);const cfg=config(c.guildId);
    const isVoice=Boolean(s.supportVoiceCases[id]);
    const set=isVoice?cfg.voice:cfg.tickets;
    if(guild){
      if(type==='public'){
        const ch=await guild.channels.fetch(set?.ratingsId).catch(()=>null);
        if(ch?.send)await ch.send({embeds:[new EmbedBuilder().setColor(COLORS.closed).setTitle('Support-Bewertung').setDescription(`${stars(starsNumber)}\n${r.comment||'Keine weitere Anmerkung.'}`).setFooter({text:'Novora · Öffentliche Bewertung'})],allowedMentions:{parse:[]}}).catch(()=>{});
      }else{
        await log(guild,set?.logsId||cfg.tickets?.logId,`Privates Support-Feedback · ${starsNumber}/5 · Fall ${id} · Antragsteller ${r.userId} · Team ${r.staffId||'—'} · Wartezeit ${r.waitSeconds??'—'}s · Gespräch ${r.durationSeconds??'—'}s · ${r.comment} · ${r.details}`);
      }
    }
    return r;
  }
  async function onInteraction(i){
    if(!i.customId?.startsWith('nvs:'))return false;
    const parts=i.customId.split(':');const action=parts[1];
    try{
      if(action==='choose'&&i.isStringSelectMenu()){
        if(i.guildId!==parts[2])throw Error('Dieses Panel gehört zu einem anderen Server.');
        // Reset selection state to allow choosing the same ticket category repeatedly.
        const cfg=config(i.guildId).tickets;
        if(cfg&&KINDS[i.values[0]]){
          const latest=ticketPanel(i.guild,cfg,tickets().filter(t=>t.guildId===i.guildId&&t.status!=='closed').length,store.state.appEmojis||{});
          await i.showModal(ticketModal(i.guildId,i.values[0]));
          await i.message.edit({components:latest.components,flags:ui.FLAG}).catch(e=>console.warn('Ticket-Menü zurücksetzen:',e.message));
          return true;
        }
        await i.showModal(ticketModal(i.guildId,i.values[0]));return true;
      }
      if(action==='tform'&&i.isModalSubmit()){
        if(i.guildId!==parts[2])throw Error('Falscher Server.');
        await i.deferReply({flags:MessageFlags.Ephemeral});const ch=await openTicket(i,parts[3]);
        await i.editReply(ui.payload({color:0x3EAD74,lines:['# ✅ Das Ticket wurde erstellt','Mit dem Button kommst du direkt zu deinem privaten Ticket.'],rows:[[new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Zum Ticket').setURL(`https://discord.com/channels/${i.guildId}/${ch.id}`)]]}));return true;
      }
      if(action==='tevidence'&&i.isButton()){
        if(!i.inGuild())throw Error('Nur in deinem privaten Ticket möglich.');
        const ticket=s.supportTickets[parts[2]],cfg=config(i.guildId).tickets;
        if(!ticket||ticket.guildId!==i.guildId||ticket.channelId!==i.channelId||ticket.status==='closed'||!cfg)throw Error('Dieses Ticket ist nicht mehr verfügbar.');
        const member=await i.guild.members.fetch(i.user.id).catch(()=>null);
        const teamRole=ticket.kind==='report'&&cfg.complaintsRoleId?cfg.complaintsRoleId:cfg.teamRoleId;
        if(i.user.id!==ticket.userId&&!staff(member,i.guild,teamRole))throw Error('Nur Ticketbeteiligte dürfen Nachweise hochladen.');
        await i.reply({content:'📎 **Datei / Screenshot hinzufügen:** Benutze unten im privaten Ticketkanal das **+**-Symbol und wähle eine Datei. Screenshots, Videos und Dokumente bleiben auf dieses Ticket beschränkt und erscheinen als Anhang im Transkript. Bitte keine Passwörter oder Zugangsdaten hochladen.',flags:MessageFlags.Ephemeral});return true;
      }
      if(action==='tclose'&&i.isButton()){
        if(!i.inGuild())throw Error('Nur im Discord-Server möglich.');
        const ticket=s.supportTickets[parts[2]],cfg=config(i.guildId).tickets;
        if(!ticket||ticket.guildId!==i.guildId||ticket.status==='closed'||!cfg)throw Error('Ticket nicht gefunden oder bereits geschlossen.');
        const member=await i.guild.members.fetch(i.user.id).catch(()=>null);
        checkTeam(i.guild,member,ticket.kind==='report'&&cfg.complaintsRoleId?cfg.complaintsRoleId:cfg.teamRoleId);
        return i.reply({...ui.payload({color:0xD48A47,lines:[
          '# Ticket wirklich schließen?',
          'Das vollständige Transkript wird vor der Kanallöschung gesichert. Schlägt die Sicherung fehl, bleibt der Kanal bestehen.'
        ],rows:[[
          new ButtonBuilder().setCustomId('nvs:tcloseconfirm:'+ticket.id).setLabel('Schließung bestätigen').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('nvs:tclosecancel:'+ticket.id).setLabel('Abbrechen').setStyle(ButtonStyle.Secondary)
        ]]}),flags:ui.FLAG|MessageFlags.Ephemeral});
      }
      if(action==='tclosecancel'&&i.isButton()){
        return i.update(ui.payload({color:0x6475DF,lines:['# Schließung abgebrochen','Das Ticket bleibt geöffnet.']}));
      }
      if(action==='tcloseconfirm'&&i.isButton()){
        await i.deferUpdate();
        const r=await actionTicket(i.guild,i.user.id,parts[2],'close');
        await i.editReply(ui.payload({color:0x3EAD74,lines:['# Ticket geschlossen','Das Transkript wurde gesichert und der Ticketkanal anschließend gelöscht.']}));
        return true;
      }
      if(['tclaim','trelease','trequest','tdecline','tstage','vclaim','vclose'].includes(action)&&i.isButton()){
        if(!i.inGuild())throw Error('Nur im Discord-Server möglich.');
        await i.deferReply({flags:MessageFlags.Ephemeral});
        const r=action==='tstage'?await actionTicket(i.guild,i.user.id,parts[2],'stage'):
          action==='tclaim'?await actionTicket(i.guild,i.user.id,parts[2],'claim'):
          action==='trequest'?await actionTicket(i.guild,i.user.id,parts[2],'request'):action==='tdecline'?await actionTicket(i.guild,i.user.id,parts[2],'decline'):action==='trelease'?await actionTicket(i.guild,i.user.id,parts[2],'release'):
          action==='vclaim'?await claimVoice(i.guild,i.user.id,parts[2]):await closeVoiceByStaff(i.guild,i.user.id,parts[2]);
        await i.editReply(action==='vclaim'?`Support übernommen: <#${r.roomId}>`:'Aktion abgeschlossen.');return true;
      }
      if(action==='review'&&i.isButton()){
        await i.reply({content:'Wähle in der Nachricht darunter 1 bis 5 Sterne. Alternativ kannst du privates Feedback abgeben.',allowedMentions:{parse:[]}});return true;
      }
      if(action==='stars'&&i.isButton()){
        const c=s.supportTickets[parts[2]]||s.supportVoiceCases[parts[2]];
        if(!c||c.userId!==i.user.id||c.status!=='closed')throw Error('Nur die betroffene Person kann ein abgeschlossenes Ticket bewerten.');
        const n=Number(parts[3]);if(!Number.isInteger(n)||n<1||n>5)throw Error('Ungültige Sternzahl.');
        if(s.supportRatings.some(x=>x.caseId===c.id&&x.kind==='public'))throw Error('Dieses Ticket wurde bereits öffentlich bewertet.');
        const r={id:randomUUID(),caseId:c.id,guildId:c.guildId,userId:i.user.id,staffId:c.staffId||null,kind:'public',stars:n,comment:'',details:'',createdAt:Date.now(),
          waitSeconds:c.claimedAt?Math.round((c.claimedAt-c.createdAt)/1000):null,
          durationSeconds:c.endedAt&&c.claimedAt?Math.round((c.endedAt-c.claimedAt)/1000):null};
        s.supportRatings.push(r);await store.persist();
        const guild=client.guilds.cache.get(c.guildId);const cfg=config(c.guildId);const isVoice=Boolean(s.supportVoiceCases[c.id]);
        const settings=isVoice?cfg.voice:cfg.tickets;
        if(guild){
          const publicCh=await guild.channels.fetch(settings?.ratingsId).catch(()=>null);
          if(publicCh?.send)await publicCh.send({embeds:[new EmbedBuilder().setColor(0x606CDD).setTitle('Neue Ticket-Bewertung').setDescription(`${stars(n)}\n${isVoice?'Voice-Support':(KINDS[c.kind]||'Support')}`).setFooter({text:clean(guild.name,65)+' • Feedback'})],allowedMentions:{parse:[]}}).catch(()=>{});
          await log(guild,settings?.logId||settings?.logsId,`Neue Bewertung · Fall ${c.id} · Nutzer ${i.user.id} · Team ${c.staffId||'—'} · ${n}/5 Sterne`);
        }
        await i.update(ui.payload({color:0x38A878,lines:[`# Vielen Dank für deine Bewertung!`,stars(n)]}));return true;
      }
      if(action==='rate'&&i.isButton()){
        await i.showModal(ratingModal(parts[3],parts[2]));return true;
      }
      if(action==='rateform'&&i.isModalSubmit()){
        await i.deferReply({flags:MessageFlags.Ephemeral});await rating(i,parts[2],parts[3]);await i.editReply('Danke für deine Bewertung!');return true;
      }
      throw Error('Diese Support-Aktion existiert nicht.');
    }catch(err){const txt='Novora Support: '+clean(err.message,240);
      if(i.deferred||i.replied)await i.editReply(action==='tcloseconfirm'?ui.payload({color:0xC74A55,lines:['# Schließung nicht abgeschlossen',txt,'Der Ticketkanal wird bei einem Transkriptfehler nicht gelöscht.']}):{content:txt}).catch(()=>{});
      else await i.reply({content:txt,flags:MessageFlags.Ephemeral}).catch(()=>{});
      return true;}
  }
  async function closeVoiceByStaff(guild,actor,id){
    const c=s.supportVoiceCases[id];if(!c||c.guildId!==guild.id)throw Error('Support-Fall nicht gefunden.');
    const cfg=config(guild.id).voice;const member=await guild.members.fetch(actor).catch(()=>null);checkTeam(guild,member,cfg?.teamRoleId);
    // A waiting request has no active voice room. The old finishVoice() returned
    // {ok:true,already:true} without closing it, while the dashboard displayed
    // "Aktion abgeschlossen". Close waiting requests explicitly and durably.
    if(c.status==='waiting'){
      if(activeLocks.has('v'+id)||activeLocks.has('finish'+id))throw Error('Voice-Fall wird bereits bearbeitet.');
      activeLocks.add('v'+id);
      try{
        if(c.status!=='waiting')throw Error('Voice-Fall wurde zwischenzeitlich verändert.');
        const before={status:c.status,endedAt:c.endedAt,endReason:c.endReason,closedBy:c.closedBy};
        c.status='closed';c.endedAt=Date.now();c.endReason='Wartende Anfrage vom Team geschlossen';c.closedBy=actor;
        const audit=recordAudit(store,{guildId:guild.id,actorId:actor,action:'support_voice_close_waiting',details:id});
        // Persist the case and its audit event in ONE transaction. If the
        // durable write fails, neither the closed state nor audit remains live.
        try{await store.persist()}catch(e){
          Object.assign(c,before);
          const index=s.audit?.findIndex(entry=>entry.id===audit.id)??-1;
          if(index>=0)s.audit.splice(index,1);
          throw e;
        }
        await editVoice(guild,c).catch(e=>console.warn('Voice-Statusanzeige konnte nicht aktualisiert werden:',e.message));
        await log(guild,cfg?.logsId,`Wartende Voice-Anfrage geschlossen · ${id} · User ${c.userId} · Team ${actor}`).catch(e=>console.warn('Voice-Log fehlgeschlagen:',e.message));
        return {ok:true,case:c};
      }finally{activeLocks.delete('v'+id)}
    }
    if(c.status!=='active')throw Error('Voice-Fall ist nicht aktiv oder bereits geschlossen.');
    // Explicit team closure disconnects the requester so no private room is left occupied.
    const requester=await guild.members.fetch(c.userId).catch(()=>null);
    if(requester?.voice?.channelId===c.roomId)await requester.voice.setChannel(null,'Novora Support · Gespräch beendet').catch(()=>{});
    const result=await finishVoice(guild,c,'Vom Team beendet');
    if(!result?.case||result.case.status!=='closed')throw Error('Voice-Fall konnte nicht bestätigt geschlossen werden.');
    recordAudit(store,{guildId:guild.id,actorId:actor,action:'support_voice_close_active',details:id});
    await store.persist().catch(e=>console.warn('Voice-Audit konnte nicht gespeichert werden:',e.message));
    return result;
  }
  async function dashboardPermission(gid,adminId){
    if(!/^\d{17,22}$/.test(String(gid))||!/^\d{17,22}$/.test(String(adminId)))throw Error('Ungültige Discord-ID');
    const guild=client.guilds.cache.get(gid);if(!guild)throw Error('Server nicht erreichbar');
    const member=await guild.members.fetch(adminId).catch(()=>null);
    if(!member||!(member.id===guild.ownerId||member.permissions.has(PermissionFlagsBits.Administrator)))throw Error('Nur Discord-Administratoren');
    return guild;
  }
  async function snapshot(gid,adminId){
    await dashboardPermission(gid,adminId);
    const myTickets=tickets().filter(x=>x.guildId===gid),myCalls=cases().filter(x=>x.guildId===gid),ratings=s.supportRatings.filter(x=>x.guildId===gid);
    return {ok:true,guildId:gid,configured:config(gid),tickets:myTickets.slice(-100),voice:myCalls.slice(-100),ratings:ratings.slice(-100),statistics:{
      openTickets:myTickets.filter(x=>x.status!=='closed').length,waitingVoice:myCalls.filter(x=>x.status==='waiting').length,
      activeVoice:myCalls.filter(x=>x.status==='active').length,closedTickets:myTickets.filter(x=>x.status==='closed').length,
      closedVoice:myCalls.filter(x=>x.status==='closed').length,avgStars:ratings.length?Number((ratings.reduce((a,r)=>a+r.stars,0)/ratings.length).toFixed(2)):null,
      avgWaitSeconds:(()=>{const a=myCalls.filter(x=>x.startedAt).map(x=>(x.startedAt-x.createdAt)/1000);return a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null})()
    }};
  }
  async function findDashboardCase(gid,adminId,kind,id){
    await dashboardPermission(gid,adminId);
    if(!['ticket','voice'].includes(kind)||! /^[a-zA-Z0-9_-]{1,80}$/.test(String(id)))throw Error('Ungültige Fallabfrage');
    const collection=kind==='ticket'?tickets():cases();
    const entry=collection.find(item=>item.guildId===gid&&String(item.id)===String(id));
    return entry?{ok:true,found:true,kind,case:entry}:{ok:false,found:false};
  }
  async function dashboardAction(gid,adminId,kind,id,action){
    const guild=await dashboardPermission(gid,adminId);
    if(kind==='ticket'&&['claim','release','close'].includes(action))return actionTicket(guild,adminId,id,action);
    if(kind==='voice'&&action==='close')return closeVoiceByStaff(guild,adminId,id);
    throw Error('Unbekannte Dashboard-Aktion');
  }
  async function shutdownRecovery(){
    // Do not close active calls on restart; reconcile only stale waiting cases and lost rooms.
    for(const c of cases().filter(x=>['active','waiting'].includes(x.status)).slice(-150)){
      const guild=client.guilds.cache.get(c.guildId);if(!guild)continue;
      const cfg=config(c.guildId).voice;if(!cfg)continue;
      const user=await guild.members.fetch(c.userId).catch(()=>null);
      const required=c.status==='waiting'?cfg.waitingId:c.roomId;
      if(user?.voice?.channelId!==required){c.status=c.status==='waiting'?'cancelled':'closed';c.endedAt=Date.now();await editVoice(guild,c);}
    }
    await store.persist();
  }
  return {config,ticketConfig,voiceConfig,setupTickets,setupVoice,sendTicketPanel,updatePublishedPanel,onInteraction,onVoiceStateUpdate:voiceJoin,
    actionTicket,onTicketMessage,claimVoice,finishVoice,closeVoiceByStaff,snapshot,findDashboardCase,dashboardAction,shutdownRecovery,
    ticketPanel,voiceNotice,ratingModal,ratings:s.supportRatings};
}
module.exports={makeSupportSuite,KINDS,ticketConfig,voiceConfig,staff,ticketPanel,voiceNotice,ticketView,ratingModal,stars};
