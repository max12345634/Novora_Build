'use strict';
// Novora Community workflows: Bewerbungen & Fraktionsanträge. No automatic approvals.
const {ChannelType,PermissionFlagsBits,MessageFlags,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,AttachmentBuilder}=require('discord.js');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const ui=require('./ui-v2');
const {decorate,serverTitle}=require('./panel-art');
const {refreshSavedPanel}=require('./panel-sync');
const {archiveTicket,tokenUrl}=require('./ticket-archive');
const {recordAudit}=require('./control');
const {sendPrivateForm}=require('./form-messages');
const TYPES=Object.freeze({
 staff:{name:'Server-Team',fields:[
  ['motivation','Warum möchtest du in unser Server-Team?','paragraph'],
  ['experience','Welche Moderations- oder RP-Erfahrung hast du?','paragraph'],
  ['scenarios','Ein Spieler wird beleidigt. Was tust du?','paragraph'],
  ['availability','Wie häufig bist du verfügbar?','short']
 ]}
});
const TEAM_STEPS=Object.freeze([
 ['profile','Wie heißt du auf Discord und im RP?'],
 ...TYPES.staff.fields.map(([key,question])=>[key,question])
]);
const DM_MAX_AGE=7*24*60*60*1000;
function nextQuestion(session){const next=TEAM_STEPS[session.step];return next?`**Frage ${session.step+1}/${TEAM_STEPS.length}**\n${next[1]}\n\nAntworte einfach hier im Chat. Mit **abbrechen** kannst du jederzeit beenden.`:null;}
const safe=(s,max=1800)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/@everyone|@here/gi,'[Erwähnung]').trim().slice(0,max);
const mention=id=>`<@${id}>`;
const ACTION_LABEL={application:'Bewerbung',faction:'Fraktionsantrag'};
const BANNERS={application:'novora-panel-applications.png',faction:'novora-panel-factions.png'};
const OPEN_BANNERS={application:'novora-application-open.png',faction:'novora-faction-open.png'};
const toId=(i)=>i.guildId||i.guild?.id;
const color=kind=>kind==='faction'?0x45AD87:0x6574DF;
function definitions(kind){
 if(kind==='application')return TYPES;
 return {legal:{name:'Legale Fraktion'},illegal:{name:'Illegale Fraktion'}};
}
function newModal(guildId,system,type){
 const isApp=system==='application';if(!(definitions(system)[type]))throw Error('Unbekannte Auswahl.');
 const modal=new ModalBuilder().setTitle((isApp?'Bewerbung':'Fraktionsantrag')+' · '+(isApp?'Formular':type==='legal'?'Legal':'Illegal')).setCustomId(`nvc:form:${system}:${type}:${guildId}`);
 const form=isApp?[
  ['profile','Discord-/RP-Name','short',true,120],
  ...TYPES[type].fields.map(([id,label,style])=>[id,label,style,true,style==='paragraph'?1100:180])
 ]:[
  ['name','Name der Fraktion','short',true,100],
  ['invite','Discord-Einladung der Fraktion','short',true,200],
  ['description','Konzept, Ziele und RP-Geschichte','paragraph',true,1500],
  ['members','Mitgliederzahl und Leitung','short',true,180],
  ['rules','Regelkonzept und weitere Hinweise','paragraph',false,1000]
 ];
 for(const [id,label,style,required,max] of form){modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setRequired(required).setStyle(style==='paragraph'?TextInputStyle.Paragraph:TextInputStyle.Short).setMaxLength(max)));}
 return modal;
}
function validateAnswers(system,type,fields){
 if(system==='application'){if(!TYPES[type])throw Error('Nur Team-Bewerbungen sind verfügbar');const result={};for(const [id,label] of [['profile','Name'],...TYPES[type].fields]){
  result[id]=safe(fields[id],1100);if(!result[id])throw Error('Bitte beantworte: '+label);
 }return result;}
 if(system!=='faction'||!['legal','illegal'].includes(type))throw Error('Fraktionsart unbekannt.');
 const result=Object.fromEntries(['name','invite','description','members','rules'].map(k=>[k,safe(fields[k],1500)]));
 for(const key of ['name','invite','description','members'])if(!result[key])throw Error('Bitte alle Pflichtfragen ausfüllen: '+key);
 if(!/^https:\/\/(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]{2,40}(?:\/?(?:\?[^\s]*)?)?$/.test(result.invite))throw Error('Bitte einen gültigen Discord-Einladungslink angeben.');
 return result;
}
function staff(member,guild,cfg){return !!(member&&(guild.ownerId===member.id||member.permissions?.has(PermissionFlagsBits.Administrator)||member.roles?.cache?.has(cfg.teamRoleId)));}
function header(guild,system,store){
 const id=store.state.appEmojis||{};
 const app=system==='application';const icon=ui.customEmoji(id,app?'nv_application':'nv_faction',app?'📋':'⚑');
 return ui.payload({color:color(system),lines:[
 `# ${icon} ${serverTitle(guild.name)} | ${app?'Bewerbungen':'Fraktionen'}`,
 app?'Bewirb dich für unser Server-Team. Du erhältst eine private Nachricht von Novora und beantwortest die Fragen einzeln im Chat. Keine langen Formulare.':'Möchtest du eine Fraktion anmelden? Wähle zunächst **legal** oder **illegal**. Beschreibe dein Konzept und füge den Discord-Einladungslink hinzu. Das zuständige Team prüft deinen Antrag; die abschließende Einteilung wird vor Veröffentlichung nochmals bestätigt.',
 'Die Bearbeitung erfolgt ausschließlich durch berechtigte Teammitglieder.'
 ],banner:BANNERS[system],rows:[[new StringSelectMenuBuilder().setCustomId(`nvc:choose:${system}:${guild.id}`).setPlaceholder(app?'Team-Bewerbung starten …':'Fraktionsart auswählen …').addOptions(Object.entries(definitions(system)).map(([value,entry])=>{
   const icon=app?'nv_moderator':(value==='legal'?'nv_legal':'nv_illegal');
   return {value,label:entry.name,...(id[icon]?{emoji:{id:id[icon],name:icon+'_flat'}}:{})};
 }))]]});
}
function reviewButtons(caseData){
 if(['approved','rejected'].includes(caseData.status))return [[new ButtonBuilder().setCustomId(`nvc:close:${caseData.id}`).setLabel('Archivieren & schließen').setStyle(ButtonStyle.Secondary)]];
 if(!['open','claimed'].includes(caseData.status))return [];
 const items=[];
 if(caseData.status==='open')items.push(new ButtonBuilder().setCustomId(`nvc:claim:${caseData.id}`).setLabel('Übernehmen').setStyle(ButtonStyle.Primary));
 if(caseData.status==='claimed')items.push(new ButtonBuilder().setCustomId(`nvc:release:${caseData.id}`).setLabel('Freigeben').setStyle(ButtonStyle.Secondary));
 if(caseData.status==='claimed')items.push(new ButtonBuilder().setCustomId(`nvc:approve:${caseData.id}`).setLabel('Annehmen').setStyle(ButtonStyle.Success));
 items.push(new ButtonBuilder().setCustomId(`nvc:reject:${caseData.id}`).setLabel('Ablehnen').setStyle(ButtonStyle.Danger));
 return [items,[new ButtonBuilder().setCustomId(`nvc:evidence:${caseData.id}`).setLabel('Datei / Screenshot').setStyle(ButtonStyle.Secondary)]];
}
function ticketCard(guild,c,store){
 const app=c.system==='application';const details=app?(TYPES[c.type]?.name||'Team-Bewerbung'):(c.type==='legal'?'Legale Fraktion':'Illegale Fraktion');
 const content=[`# ${app?'📋':'⚑'} ${serverTitle(guild.name)} | ${app?'Bewerbung':'Fraktionsantrag'}`,
  `Vielen Dank für deinen Antrag. Unser zuständiges Team kümmert sich darum.\n**Case-ID:** \`${c.id.slice(0,8).toUpperCase()}\`\n**Art:** ${details}\n**Antragsteller:** ${mention(c.userId)}\n**Status:** ${c.status==='claimed'?'In Bearbeitung':c.status==='approved'?'Angenommen':c.status==='rejected'?'Abgelehnt':'Wartet auf das Team'}\n**Bearbeiter:** ${c.staffId?mention(c.staffId):'Noch niemand'}`,
  'Alle Antworten stehen unten im Ticket. Screenshots und Dateien kannst du hier mit dem **+**-Symbol anhängen.'];
 if(c.status==='approved'&&c.reviewedType)content.push('**Bestätigte Einstufung:** '+(c.reviewedType==='legal'?'Legal':'Illegal'));
 return ui.payload({color:color(c.system),lines:content,banner:OPEN_BANNERS[c.system],rows:reviewButtons(c)});
}
function makeCommunitySuite({client,store,publicUrl}){
 const state=store.state;state.communitySettings ||= {};state.communityCases ||= {};state.applicationSessions ||= {};const dmLocks=new Set();
 const settings=(guildId,system)=>state.communitySettings[guildId]?.[system];
 const mutex=new Set();
 const ensureStaff=async(i,cfg,c)=>{const member=await i.guild.members.fetch(i.user.id).catch(()=>null);
   if(!staff(member,i.guild,cfg))throw Error('Nur das zuständige Team darf Anträge bearbeiten.');
   if(c&&c.userId===i.user.id)throw Error('Eigene Anträge dürfen nicht selbst bearbeitet werden.');};
 const bannerFile=name=>new AttachmentBuilder(path.join(__dirname,'..','assets','banners',name),{name});
 async function applySetup(i,system,values){
  if(!['application','faction'].includes(system))throw Error('Ungültiges System');
  if(!i.memberPermissions?.has(PermissionFlagsBits.Administrator))throw Error('Administratorrechte erforderlich.');
  for(const k of ['panel','tickets','team',...(system==='faction'?['legalforum','illegalforum']:[])])if(!values[k])throw Error('Einrichtung unvollständig: '+k);
  if(values.team===i.guildId)throw Error('@everyone ist als Teamrolle nicht erlaubt.');
  const me=await i.guild.members.fetchMe();
  if(!me?.permissions?.has([PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages]))throw Error('Bot benötigt Kanäle verwalten, Kanäle ansehen und Nachrichten senden.');
  if(system==='faction'&&values.legalforum===values.illegalforum)throw Error('Für legale und illegale Fraktionen verschiedene Foren wählen.');
  const role=await i.guild.roles.fetch(values.team).catch(()=>null);
  if(!role||role.managed)throw Error('Teamrolle fehlt oder wird durch eine Integration verwaltet.');
  const expected={panel:ChannelType.GuildText,tickets:ChannelType.GuildCategory,legalforum:ChannelType.GuildForum,illegalforum:ChannelType.GuildForum,logs:ChannelType.GuildText};
  for(const [key,type] of Object.entries(expected)){
    if(!values[key])continue;
    const channel=await i.guild.channels.fetch(values[key]).catch(()=>null);
    if(!channel||channel.type!==type)throw Error('Ungültiger oder gelöschter Kanal: '+key);
  }
  const prev=settings(i.guildId,system)||{};
  state.communitySettings[i.guildId] ||= {};
  state.communitySettings[i.guildId][system]={panelId:values.panel,categoryId:values.tickets,teamRoleId:values.team,
    legalForumId:values.legalforum||null,illegalForumId:values.illegalforum||null,logId:values.logs||null,
    panelMessageId:prev.panelId===values.panel?prev.panelMessageId:null};
  await store.persist();return `**${ACTION_LABEL[system]} eingerichtet.** Jetzt /setup → „Panel veröffentlichen“ auswählen.`;
 }
 async function publishPanel(guild,system){
  const cfg=settings(guild.id,system);if(!cfg)throw Error('Bitte zuerst '+ACTION_LABEL[system]+' einrichten.');
  const ch=await guild.channels.fetch(cfg.panelId).catch(()=>null);if(!ch?.send)throw Error('Panelkanal fehlt.');
  const old=cfg.panelMessageId?await ch.messages.fetch(cfg.panelMessageId).catch(()=>null):null;
  // Don't post a second public panel if the tracked one was deleted.
  if(cfg.panelMessageId&&!old)throw Error('Das gespeicherte Panel wurde gelöscht. Bitte den alten Eintrag prüfen und bewusst erneut einrichten.');
  const message=await ui.publish(ch,decorate(header(guild,system,store),system==='application'?'applications':'factions',old),old);
  cfg.panelMessageId=message.id;await store.persist();return message;
 }
 async function refreshPanel(guild,system){
  const cfg=settings(guild.id,system);
  return refreshSavedPanel({guild,channelId:cfg?.panelId,messageId:cfg?.panelMessageId,
   makePayload:old=>decorate(header(guild,system,store),system==='application'?'applications':'factions',old),
   onReplaced:async id=>{cfg.panelMessageId=id;await store.persist();}});
 }
 async function edit(guild,c){const ch=await guild.channels.fetch(c.channelId).catch(()=>null),msg=await ch?.messages.fetch(c.messageId).catch(()=>null);
  if(!msg)throw Error('Antragsnachricht nicht gefunden.');
  const name=OPEN_BANNERS[c.system];const next=await ui.publish(ch,{...ticketCard(guild,c,store),files:[bannerFile(name)],attachments:[]},msg);
  if(next.id!==msg.id){c.messageId=next.id;await store.persist();}}
 async function createFromAnswers(guild,requester,system,type,answers){
  const cfg=settings(guild.id,system);if(!cfg)throw Error('Das System ist nicht eingerichtet.');
  if(Object.values(state.communityCases).some(c=>c.guildId===guild.id&&c.userId===requester.id&&c.system===system&&['open','claimed'].includes(c.status)))throw Error('Du hast bereits einen offenen Antrag.');
  answers=validateAnswers(system,type,answers);
   const caseData={id:randomUUID(),guildId:guild.id,userId:requester.id,system,type,answers,staffId:null,status:'open',createdAt:Date.now(),channelId:null,messageId:null};
   const ch=await guild.channels.create({type:ChannelType.GuildText,name:(system==='application'?'bewerbung-':'fraktion-')+requester.id.slice(-7),parent:cfg.categoryId,
    permissionOverwrites:[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:requester.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
      {id:cfg.teamRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},
      {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]}],reason:'Novora '+ACTION_LABEL[system]});
   caseData.channelId=ch.id;
   try{
    const p=ticketCard(guild,caseData,store);p.components[0].components.unshift(ui.text(`<@&${cfg.teamRoleId}> · <@${requester.id}>`));
    p.allowedMentions={roles:[cfg.teamRoleId],users:[requester.id]};
    const m=await ch.send({...p,files:[bannerFile(OPEN_BANNERS[system])]});caseData.messageId=m.id;
    const labels=system==='application'?{profile:'Discord-/RP-Name',...Object.fromEntries(TYPES[type].fields.map(f=>[f[0],f[1]]))}:
     {name:'Fraktionsname',invite:'Discord-Einladung',description:'Konzept, Ziele und RP-Geschichte',members:'Mitgliederzahl / Leitung',rules:'Regelkonzept und Hinweise'};
    const parts=['# Eröffnungsformular · '+ACTION_LABEL[system],...Object.entries(answers).filter(([,value])=>!!value).map(([key,value])=>'**'+labels[key]+'**\n'+value)];
    await sendPrivateForm(ch,parts,{color:color(system)});
    state.communityCases[caseData.id]=caseData;
    try{await store.persist();}catch(err){delete state.communityCases[caseData.id];throw err;}
    // A completed, persisted private application must never be deleted because
    // a secondary audit operation failed.
    try{recordAudit(store,{guildId:guild.id,actorId:requester.id,action:'community_'+system+'_created',details:caseData.id});}
    catch(err){console.warn('Antrags-Audit konnte nicht geschrieben werden:',err.message);}
    return ch;
   }catch(err){if(state.communityCases[caseData.id]!==caseData)await ch.delete('Antragseinrichtung fehlgeschlagen').catch(()=>{});throw err;}
 }
 async function submit(i,system,type){
  const raw=Object.fromEntries((system==='application'?['profile',...TYPES[type].fields.map(f=>f[0])]:['name','invite','description','members','rules']).map(k=>{let value='';try{value=i.fields.getTextInputValue(k)}catch{}return [k,value];}));
  const key='new:'+system+':'+i.guildId+':'+i.user.id;
  if(mutex.has(key))throw Error('Antrag wird bereits erstellt.');mutex.add(key);
  try{return await createFromAnswers(i.guild,i.user,system,type,raw);}finally{mutex.delete(key)}
 }
 async function beginDM(i){
  const gid=i.customId.slice('nvapp:begin:'.length);
  const cfg=settings(gid,'application');if(!cfg)throw Error('Bewerbungen sind nicht eingerichtet.');
  const guild=await client.guilds.fetch(gid).catch(()=>null);
  if(!guild||!await guild.members.fetch(i.user.id).catch(()=>null))throw Error('Du musst Mitglied des Servers sein.');
  if(Object.values(state.communityCases).some(c=>c.guildId===gid&&c.userId===i.user.id&&c.system==='application'&&['open','claimed'].includes(c.status)))throw Error('Du hast bereits eine offene Team-Bewerbung.');
  const active=state.applicationSessions[i.user.id];
  if(active&&active.guildId!==gid&&Date.now()-active.updatedAt<DM_MAX_AGE)throw Error('Bitte beende zuerst die Bewerbung für deinen anderen Server mit „abbrechen“.');
  const session=active?.guildId===gid&&Date.now()-active.updatedAt<DM_MAX_AGE?active:{guildId:gid,userId:i.user.id,step:0,answers:{},updatedAt:Date.now()};
  state.applicationSessions[i.user.id]=session;await store.persist();
  // Keep the existing Components V2 message type; update only its component tree.
  await i.update({components:ui.payload({color:0x6574DF,lines:[`# ${serverTitle(guild.name)} | Team-Bewerbung`,'Die Bewerbung wurde gestartet. Ich sende dir jetzt die erste Frage.']}).components});
  await i.user.send(ui.payload({color:0x6574DF,lines:[`# ${serverTitle(guild.name)} | Team-Bewerbung`,nextQuestion(session)]}));
 }
 async function onDMMessage(message){
  if(message.guildId||message.author?.bot)return false;
  const session=state.applicationSessions[message.author?.id];if(!session)return false;
  const key=message.author.id;
  if(dmLocks.has(key))return true;dmLocks.add(key);
  try{
   if(Date.now()-session.updatedAt>DM_MAX_AGE){delete state.applicationSessions[key];await store.persist();await message.channel.send('Deine alte Bewerbung ist abgelaufen. Starte über das Bewerbungs-Panel erneut.');return true;}
   const reply=safe(message.content,1100);
   if(reply.toLowerCase()==='abbrechen'){delete state.applicationSessions[key];await store.persist();await message.channel.send('Die Team-Bewerbung wurde abgebrochen. Du kannst jederzeit neu starten.');return true;}
   if(reply.toLowerCase()==='fortsetzen'){await message.channel.send(nextQuestion(session)||'Deine Antworten sind vollständig. Schreibe **fertig** zum erneuten Absenden.');return true;}
   if(session.step<TEAM_STEPS.length){
    if(!reply){await message.channel.send('Bitte schreibe deine Antwort als Text. Anhänge kannst du später im privaten Bewerbungs-Ticket senden.');return true;}
    const [field]=TEAM_STEPS[session.step];session.answers[field]=reply;session.step++;session.updatedAt=Date.now();await store.persist();
    if(session.step<TEAM_STEPS.length){await message.channel.send(nextQuestion(session));return true;}
   }else if(reply.toLowerCase()!=='fertig'){await message.channel.send('Alle Fragen sind beantwortet. Schreibe **fertig**, um das Senden erneut zu versuchen, oder **abbrechen**.');return true;}
   const guild=await client.guilds.fetch(session.guildId).catch(()=>null);
   if(!guild||!await guild.members.fetch(key).catch(()=>null))throw Error('Deine Mitgliedschaft im Server konnte nicht bestätigt werden.');
   // A previous submission may have committed the ticket before the DM session
   // cleanup failed (or before a process restart). Resume without duplicating it.
   const existing=Object.values(state.communityCases).find(c=>c.guildId===guild.id&&c.userId===key&&c.system==='application'&&['open','claimed'].includes(c.status));
   const ch=existing?{id:existing.channelId}:await createFromAnswers(guild,message.author,'application','staff',session.answers);
   delete state.applicationSessions[key];await store.persist();
   await message.channel.send(ui.payload({color:0x3F9C78,lines:['# Team-Bewerbung eingereicht','Danke! Das zuständige Team hat deine Antworten erhalten.'],rows:[[new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Zum privaten Bewerbungsticket').setURL(`https://discord.com/channels/${guild.id}/${ch.id}`)]]}));
   return true;
  }catch(e){await message.channel.send('Deine Antworten bleiben gespeichert. '+safe(e.message,180)+' Schreibe **fertig** zum erneuten Versuchen oder **abbrechen**.').catch(()=>{});return true;
  }finally{dmLocks.delete(key)}
 }
 async function decide(i,c,action,route){
  const cfg=settings(i.guildId,c.system);if(!cfg)throw Error('Systemkonfiguration fehlt.');
  await ensureStaff(i,cfg,c);
  const key='decide:'+c.id;if(mutex.has(key))throw Error('Antrag wird bereits verarbeitet.');mutex.add(key);
  try{
   if(!['open','claimed'].includes(c.status))throw Error('Antrag ist bereits abgeschlossen.');
   if(action==='claim'){
    if(c.status!=='open')throw Error('Bereits übernommen.');c.staffId=i.user.id;c.status='claimed';await store.persist();await edit(i.guild,c);
   }else if(action==='release'){
    if(c.staffId!==i.user.id&&!i.memberPermissions?.has(PermissionFlagsBits.Administrator))throw Error('Nur der Bearbeiter kann freigeben.');
    c.staffId=null;c.status='open';await store.persist();await edit(i.guild,c);
   }else if(action==='approve'||action==='reject'){
    if(c.status!=='claimed')throw Error('Bitte zuerst den Antrag übernehmen.');
    if(c.staffId!==i.user.id&&!i.memberPermissions?.has(PermissionFlagsBits.Administrator))throw Error('Nur der Bearbeiter kann entscheiden.');
    if(action==='approve'&&c.system==='faction'){
     if(!['legal','illegal'].includes(route))throw Error('Die bestätigte Einstufung fehlt.');
     const forumId=route==='legal'?cfg.legalForumId:cfg.illegalForumId;
     const forum=await i.guild.channels.fetch(forumId).catch(()=>null);
     if(!forum||forum.type!==ChannelType.GuildForum)throw Error('Das Ziel-Forum ist nicht verfügbar. Antrag bleibt offen.');
     if(c.forumThreadId){
      // Retry after a partially completed approval: do not publish twice.
      if(c.forumChannelId!==forumId||c.reviewedType!==route)throw Error('Die Fraktion wurde bereits einer anderen Einstufung zugeordnet.');
      if(forum.threads?.fetch){const existing=await forum.threads.fetch(c.forumThreadId).catch(()=>null);
       if(!existing)throw Error('Der bereits gespeicherte Forenbeitrag fehlt. Bitte manuell prüfen, bevor der Antrag abgeschlossen wird.');}
     }else{
      const post=await forum.threads.create({name:safe(c.answers.name,90),message:{content:[`## ${safe(c.answers.name,90)}`,
       `**Case-ID:** ${c.id}`,
       `**Einstufung (vom Team bestätigt):** ${route==='legal'?'Legal':'Illegal'}`,
       `**Beschreibung:** ${safe(c.answers.description,1500)}`,
       `**Mitglieder / Leitung:** ${safe(c.answers.members,180)}`,
       `**Discord:** ${c.answers.invite}`,
       `**Ansprechpartner:** ${mention(c.userId)}`].join('\n\n').slice(0,1950),allowedMentions:{parse:[]}},reason:'Novora Fraktionsantrag bestätigt'});
      c.forumChannelId=forumId;c.forumThreadId=post.id;c.reviewedType=route;
      // Commit the external side effect before the final status transition.
      // If this write fails, the in-memory thread ID still prevents a duplicate
      // on a retry within the same process; no automatic republishing occurs.
      await store.persist();
     }
    }
    const previous={status:c.status,decisionAt:c.decisionAt,decidedBy:c.decidedBy};
    c.status=action==='approve'?'approved':'rejected';c.decisionAt=Date.now();c.decidedBy=i.user.id;
    try{await store.persist();}catch(err){Object.assign(c,previous);throw err;}
    // Once committed, a deleted header message must not undo the decision or
    // trigger a second forum publication on the next button click.
    await edit(i.guild,c).catch(err=>console.warn('Antragskarte konnte nicht aktualisiert werden:',err.message));
    const note=action==='approve'?'angenommen':'abgelehnt';
    const member=await i.guild.members.fetch(c.userId).catch(()=>null);
    await member?.send?.(ui.payload({color:action==='approve'?0x3B956F:0xBF6474,lines:[`# Dein ${ACTION_LABEL[c.system]} wurde ${note}`,`Server: **${serverTitle(i.guild.name)}** · Case-ID: \`${c.id.slice(0,8).toUpperCase()}\``]})).catch(()=>{});
    const logChannel=await i.guild.channels.fetch(cfg.logId).catch(()=>null);
    await logChannel?.send?.(ui.payload({color:color(c.system),lines:[`**${ACTION_LABEL[c.system]} ${note}** · ${c.id} · geprüft von ${i.user.id}${route?' · '+route:''}`]})).catch(()=>{});
   }
   recordAudit(store,{guildId:i.guildId,actorId:i.user.id,action:`community_${c.system}_${action}`,details:c.id+(route?' · '+route:'')});
  }finally{mutex.delete(key)}
 }
 async function onInteraction(i){if(i.customId?.startsWith('nvapp:begin:')){try{await beginDM(i);}catch(e){if(i.deferred||i.replied)await i.editReply({content:safe(e.message,220)}).catch(()=>{});else await i.reply({content:safe(e.message,220)}).catch(()=>{});}return true;}if(!i.customId?.startsWith('nvc:'))return false;
  try{
   const parts=i.customId.split(':'),action=parts[1];
   if(!i.inGuild?.())throw Error('Diese Aktion funktioniert nur auf Discord-Servern.');
   if(action==='choose'&&i.isStringSelectMenu()){
    const system=parts[2],type=i.values[0];if(parts[3]!==i.guildId)throw Error('Dieses Panel gehört zu einem anderen Server.');
    if(system==='application'){
     if(type!=='staff')throw Error('Es sind nur Team-Bewerbungen verfügbar.');
     const cfg=settings(i.guildId,'application');if(!cfg)throw Error('Bewerbungen nicht eingerichtet.');
     if(Object.values(state.communityCases).some(c=>c.guildId===i.guildId&&c.userId===i.user.id&&c.system==='application'&&['open','claimed'].includes(c.status)))throw Error('Du hast bereits eine offene Team-Bewerbung.');
     try{await i.user.send(ui.payload({color:0x6574DF,lines:[`# ${serverTitle(i.guild.name)} | Team-Bewerbung`,'Hallo! Klicke auf **Bewerbung starten**. Danach stelle ich dir die Fragen einzeln hier in der privaten Nachricht.'],rows:[[new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel('Bewerbung starten').setCustomId(`nvapp:begin:${i.guildId}`)]]}));}
     catch{throw Error('Ich kann dir keine private Nachricht schicken. Bitte aktiviere DMs von Servermitgliedern und versuche es erneut.');}
     await i.reply({content:'📨 Ich habe dir eine private Nachricht mit **Bewerbung starten** geschickt.',flags:MessageFlags.Ephemeral});
     await i.message.edit(decorate(header(i.guild,'application',store),'applications',i.message)).catch(()=>{});
     return true;
    }
    await i.showModal(newModal(i.guildId,system,type));
    // select reset happens by editing unchanged source, retaining same message ID
    const cfg=settings(i.guildId,system);if(cfg)await i.message.edit(decorate(header(i.guild,system,store),system==='application'?'applications':'factions',i.message)).catch(()=>{});
    return true;
   }
   if(action==='form'&&i.isModalSubmit()){
    if(parts[2]==='application')throw Error('Team-Bewerbungen starten jetzt per privater Nachricht. Bitte das Bewerbungs-Panel erneut öffnen.');
    if(parts[4]!==i.guildId)throw Error('Falscher Server.');await i.deferReply({flags:MessageFlags.Ephemeral});
    const ch=await submit(i,parts[2],parts[3]);await i.editReply(ui.payload({color:0x3F9C78,lines:['# Dein Antrag wurde erstellt','Alle Angaben wurden privat an das zuständige Team übergeben.'],rows:[[new ButtonBuilder().setLabel('Zum Ticket').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${i.guildId}/${ch.id}`)]]}));return true;
   }
   const c=state.communityCases[parts[2]];if(!c||c.guildId!==i.guildId)throw Error('Antrag nicht gefunden.');
   const cfg=settings(i.guildId,c.system);if(!cfg)throw Error('System ist nicht eingerichtet.');
   if(action==='evidence'&&i.isButton()){
    const member=await i.guild.members.fetch(i.user.id).catch(()=>null);
    if(c.channelId!==i.channelId||!(c.userId===i.user.id||staff(member,i.guild,cfg)))throw Error('Nur Beteiligte im privaten Antrag können Nachweise hinzufügen.');
    await i.reply({content:'📎 Verwende das **+**-Symbol unten im privaten Ticketkanal, um ein Bild, Video oder Dokument zu senden. Es wird als Anhang im Transkript erfasst.',flags:MessageFlags.Ephemeral});return true;
   }
   if(action==='approve'&&i.isButton()&&c.system==='faction'){
    await ensureStaff(i,cfg,c);if(c.status!=='claimed')throw Error('Bitte zuerst übernehmen.');
    await i.reply({...ui.payload({color:0x3A946E,lines:[
     '# Fraktionsantrag überprüfen',
     `**Antrag:** ${safe(c.answers.name,90)}`,
     `**Ausgewählte Kategorie:** ${c.type==='legal'?'Legal':'Illegal'}`,
     'Bitte prüfe die Angaben und bestätige die tatsächliche Einteilung. Der Beitrag wird erst nach deiner ausdrücklichen Auswahl im passenden Forum veröffentlicht.'
    ],rows:[[new ButtonBuilder().setLabel('Als legal bestätigen').setStyle(ButtonStyle.Success).setCustomId('nvc:confirm:'+c.id+':legal'),new ButtonBuilder().setLabel('Als illegal bestätigen').setStyle(ButtonStyle.Primary).setCustomId('nvc:confirm:'+c.id+':illegal')]]}),flags:ui.FLAG|MessageFlags.Ephemeral});return true;
   }
   if(action==='confirm'&&i.isButton()){
    await ensureStaff(i,cfg,c);
    await i.deferUpdate();await decide(i,c,'approve',parts[3]);await i.editReply(ui.payload({color:0x3C956B,lines:['# Fraktion freigegeben','Die Einteilung wurde geprüft und der Beitrag im entsprechenden Forum veröffentlicht.']}));return true;
   }
   if(['claim','release','approve','reject'].includes(action)&&i.isButton()){
    if(action==='reject'){
     await ensureStaff(i,cfg,c);if(c.status!=='claimed')throw Error('Bitte zuerst übernehmen.');
     await i.reply({...ui.payload({color:0xBC6379,lines:['# Antrag wirklich ablehnen?','Die Entscheidung wird protokolliert.'],rows:[[new ButtonBuilder().setLabel('Ablehnung bestätigen').setStyle(ButtonStyle.Danger).setCustomId('nvc:rejectconfirm:'+c.id)]]}),flags:ui.FLAG|MessageFlags.Ephemeral});return true;
    }
    await ensureStaff(i,cfg,c);
    await i.deferReply({flags:MessageFlags.Ephemeral});await decide(i,c,action);await i.editReply(ui.payload({color:0x5865D6,lines:['# Antrag aktualisiert',`Aktion: ${action==='claim'?'Übernommen':action==='release'?'Freigegeben':'Angenommen'}`]}));return true;
   }
   if(action==='rejectconfirm'&&i.isButton()){await ensureStaff(i,cfg,c);await i.deferUpdate();await decide(i,c,'reject');await i.editReply(ui.payload({color:0xBC6379,lines:['# Antrag abgelehnt','Der Antragsteller wurde nach Möglichkeit benachrichtigt.']}));return true;}
   if(action==='close'&&i.isButton()){
    await ensureStaff(i,cfg,c);if(!['approved','rejected'].includes(c.status))throw Error('Bitte den Antrag zuerst entscheiden.');
    await i.deferReply({flags:MessageFlags.Ephemeral});const key='close:'+c.id;
    if(mutex.has(key))throw Error('Archivierung läuft bereits.');mutex.add(key);
    try{
     const channel=await i.guild.channels.fetch(c.channelId).catch(()=>null);if(!channel)throw Error('Antragskanal nicht gefunden.');
     const closing={...c,title:c.answers.name||c.answers.profile||ACTION_LABEL[c.system],kind:c.system};
     const archive=await archiveTicket({store,channel,guild:i.guild,ticket:closing,kind:c.system,actorId:i.user.id,closedAt:Date.now()});
     // The complete transcript and durable access index are already saved.
     // Do not mark closed until Discord confirms deletion; failure is retryable.
     await channel.delete('Novora Antrag sicher archiviert');
     c.transcriptToken=archive.token;c.closedAt=Date.now();c.status='closed';await store.persist();
     const user=await i.guild.members.fetch(c.userId).catch(()=>null),url=tokenUrl(publicUrl,archive.token);
     if(user&&url)await user.send(ui.payload({color:color(c.system),lines:['# Dein Antrag wurde archiviert','Du kannst deinen Verlauf über diesen privaten Link einsehen: '+url]})).catch(()=>{});
     await i.editReply(ui.payload({color:0x4AAA88,lines:['# Ticket archiviert','Transkript gesichert und Kanal geschlossen.']}));
    }finally{mutex.delete(key)}return true;
   }
   throw Error('Ungültige Antragsaktion.');
  }catch(error){const payload={content:'Novora: '+safe(error.message,230),flags:MessageFlags.Ephemeral};
   if(i.deferred||i.replied)await i.editReply(payload).catch(()=>{});else await i.reply(payload).catch(()=>{});return true;}
 }
 return {settings,applySetup,publishPanel,refreshPanel,onInteraction,onDMMessage,validateAnswers,newModal};
}
module.exports={makeCommunitySuite,TYPES,TEAM_STEPS,nextQuestion,newModal,validateAnswers,header,ticketCard,staff};
