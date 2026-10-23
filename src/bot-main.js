'use strict';

// Novora Verify — bot on BotHosting.net, administration on AppDeploy.
// Do not run this token on two Discord gateway processes simultaneously.
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, MessageFlags, Routes, Partials } = require('discord.js');
const { makeStore, loadOrCreateEncryptionKey } = require('./store');
const { makeOAuth, id } = require('./oauth');
const { makeApi } = require('./api');
const { normalizeJob, resultsForWebsite } = require('./jobs');
const { startWebsite } = require('./website');
const { makeBridge, isApplicationOwner } = require('./bridge');
const { makeRoleAdministration } = require('./roles');
const {userMessages}=require('./messages');
const {applyBranding}=require('./branding');
const {uploadEmoji}=require('./emoji');
const {uploadPartnershipEmojis}=require('./partner-emojis');
const { VERSION, defaults, validatePatch, recordAudit, stats } = require('./control');
const { makeSecurityCenter } = require('./security-center');
const { makeOwnerAlerts } = require('./owner-alerts');
const { history: updateHistory } = require('./changelog');
const { makePartnerships } = require('./partnerships');
const { makeSupportSuite } = require('./support-suite');
const { makeCommunitySuite }=require('./community-suite');
const {makeRpSuite}=require('./rp-suite');
const {makeStandardSuite}=require('./standard-suite');
const { makeMemberGreetings }=require('./member-greetings');
const { makeVoiceAudio }=require('./voice-audio');
const {decorate}=require('./panel-art');
const ui=require('./ui-v2');
const {serverTitle}=require('./panel-art');
const {refreshSavedPanel,summarizePanels}=require('./panel-sync');
const { makeSetupFlow, setupCommand } = require('./setup-flow');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const key of required) if (!process.env[key] || /YOUR-|HIER-|REPLACE|DEINE-/.test(process.env[key])) { console.error('Fehlende Konfiguration: ' + key); process.exit(1); }
const env = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  secret: process.env.DISCORD_CLIENT_SECRET,
  website: (process.env.WEBSITE_URL || 'https://novora-verify-control-center-ae02zt.v2.appdeploy.ai').replace(/\/$/, ''),
  ownerId: process.env.WEBSITE_OWNER_ID,
  botKey: process.env.BOT_API_KEY,
  publicUrl: (process.env.BOT_PUBLIC_URL || 'https://6e8v8mfxpp.apps.bot-hosting.cloud').replace(/\/$/, ''),
  encryption: process.env.TOKEN_ENCRYPTION_KEY,
  port: Number(process.env.SERVER_PORT || process.env.PORT || 26601),
  syncMs: Math.max(30000, Number(process.env.SYNC_INTERVAL_SECONDS || 45) * 1000),
  dataDir: path.resolve(process.env.DATA_DIR || './data')
};
if (!/^https:\/\//.test(env.publicUrl) || !/^https:\/\//.test(env.website)) throw new Error('WEBSITE_URL and BOT_PUBLIC_URL must use HTTPS');
if (!id(env.clientId)) throw new Error('Invalid DISCORD_CLIENT_ID');
if (process.env.ENABLE_LEGACY_WEBSITE_SYNC === 'true' && env.ownerId && !/^[a-zA-Z0-9._-]{10,80}$/.test(env.ownerId)) throw new Error('Invalid WEBSITE_OWNER_ID');
if (process.env.ENABLE_LEGACY_WEBSITE_SYNC === 'true' && env.botKey && !/^nv_[a-f0-9]{64}$/.test(env.botKey)) throw new Error('BOT_API_KEY must be the key created in the website dashboard');
if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) throw new Error('Invalid SERVER_PORT');

const store = makeStore(env.dataDir, loadOrCreateEncryptionKey(env.dataDir, env.encryption));
const gatewayIntents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildModeration,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.DirectMessages,...(process.env.ENABLE_MEMBER_EVENTS==='true'?[GatewayIntentBits.GuildMembers]:[])];
if (process.env.ENABLE_MESSAGE_CONTENT === 'true') gatewayIntents.push(GatewayIntentBits.MessageContent);
const client = new Client({ intents: gatewayIntents, partials: [Partials.Channel] });
const ownerAlerts=makeOwnerAlerts({client,store});
const security = makeSecurityCenter({client,store,dataDir:env.dataDir,ownerAlerts});
const partnershipSystem=makePartnerships({client,store:{...store,dataDir:env.dataDir},publicUrl:env.publicUrl});
const supportSuite=makeSupportSuite({client,store:{...store,dataDir:env.dataDir},publicUrl:env.publicUrl});
const rpSuite=makeRpSuite({store});
const standardSuite=makeStandardSuite({store});
client.on(Events.MessageCreate,m=>{void standardSuite.onMessage(m)});
const communitySuite=makeCommunitySuite({client,store:{...store,dataDir:env.dataDir},publicUrl:env.publicUrl});
const memberGreetings=makeMemberGreetings({store});
client.on(Events.MessageCreate,message=>{if(!message.guildId&&!message.author?.bot)void communitySuite.onDMMessage(message).catch(e=>console.warn('Team-Bewerbung DM:',e.message));});
if(process.env.ENABLE_MEMBER_EVENTS!=='true')console.warn('Novora: Willkommens- und Leave-Nachrichten benötigen ENABLE_MEMBER_EVENTS=true und das aktivierte Guild Members Intent im Discord Developer Portal. Alle anderen Systeme bleiben verfügbar.');
const voiceAudio=makeVoiceAudio({client,dataDir:env.dataDir});
client.on(Events.GuildMemberAdd,m=>{void memberGreetings.event(m,'join').catch(e=>console.warn('Welcome:',e.message))});
client.on(Events.GuildMemberRemove,m=>{void memberGreetings.event(m,'leave').catch(e=>console.warn('Leave:',e.message))});
client.on(Events.VoiceStateUpdate,(oldState,newState)=>{
 const guild=newState.guild||oldState.guild;const cfg=store.state.supportSettings?.[guild?.id]?.voice;
 void (async()=>{
  await supportSuite.onVoiceStateUpdate(oldState,newState);
  if(cfg&&!newState.member?.user?.bot&&!oldState.member?.user?.bot){
   if(newState.channelId===cfg.waitingId&&oldState.channelId!==cfg.waitingId){
    const ch=await guild.channels.fetch(cfg.waitingId).catch(()=>null);if(ch)await voiceAudio.enter(guild,ch);
   }
   if(oldState.channelId===cfg.waitingId&&newState.channelId!==cfg.waitingId)await voiceAudio.checkLeave(guild,cfg.waitingId);
  }
 })().catch(err=>console.error('Voice Support:',err.message));
});
setInterval(()=>{if(client.isReady())void partnershipSystem.refreshCounts(null,30).catch(err=>console.warn('Partnerschafts-Sync:',err.message));},6*60*60*1000).unref();
client.on(Events.GuildAuditLogEntryCreate,(entry,guild)=>{void security.onEntry(entry,guild).catch(e=>console.error('Audit event:',e.message))});
const api = process.env.ENABLE_LEGACY_WEBSITE_SYNC === 'true' && env.ownerId && env.botKey ? makeApi(env.website, env.ownerId, env.botKey) : null;
if (!api) console.log('Website-Verbindung: Direktabruf aktiv. Führe /website-verbinden aus und gib den Code im Dashboard ein. Alte 403-Synchronisierung deaktiviert.');
const guildDefaults = new Set((process.env.TRANSFER_GUILD_IDS || '').split(',').map(x => x.trim()).filter(id));
let lastSync = 0;
let syncBusy = false;
let jobsBusy = false;
let shuttingDown = false;
let saveTimer = null;

for (const guildId of guildDefaults) {
  if (!store.state.guilds[guildId]) store.state.guilds[guildId] = { allowTransfer: true };
}
const oauth = env.secret ? makeOAuth({
  clientId: env.clientId, clientSecret: env.secret, publicUrl: env.publicUrl, store,
  validateMember: async (guildId, userId) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Der Server ist nicht mit dem Bot verbunden');
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) throw new Error('Bitte zuerst dem Discord-Server beitreten, dann erneut verifizieren.');
  }
}) : null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    store.persist().catch(error => console.error('Datenspeicherung fehlgeschlagen:', error.message));
  }, 5000);
}
async function grantRole(member, guildId) {
  const roleId = store.state.guilds[guildId]?.roleId;
  if (!roleId) throw new Error('Keine Verifizierungsrolle eingestellt. Bitte /verify-role ausführen.');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error('Server ist nicht mehr mit dem Bot verbunden.');
  const user = await guild.members.fetch(member.id);
  await user.roles.add(roleId, 'Novora Verify: Discord-Verifizierung');
  const removeRoleId = store.state.guilds[guildId]?.removeRoleId;
  if (removeRoleId && removeRoleId !== roleId && user.roles.cache.has(removeRoleId)) await user.roles.remove(removeRoleId, 'Novora Verify: Unverifiziert-Rolle entfernen');
}
function guildInfo(g) {
  return { id: g.id, name: g.name, icon: g.iconURL({ extension: 'png', size: 128 }), allowTransfer: !!store.state.guilds[g.id]?.allowTransfer, brandingApproved:store.state.guilds[g.id]?.brandingApproved===true, verifiedCount:Object.values(store.state.members).filter(m=>(m.verifiedGuildIds||[]).includes(g.id)).length };
}
function memberInfo(member) {
  const counts = member.counts || {};
  return {
    id: member.id,
    username: member.username,
    displayName: member.displayName,
    avatar: member.avatar,
    verifiedAt: member.verifiedAt,
    guildId: member.guildId,
    oauthAuthorized:!!member.transfer?.access, authorizedAt:member.transfer?.authorizedAt||null,
    consent: !!(member.transfer?.scopes||[]).includes('guilds.join'),
    consentTargets: member.transfer?.allowedTargets || [],
    messages: Object.values(counts).reduce((total, n) => total + Math.max(0, Number(n)||0),0),
    guildIds: [...new Set([...(member.verifiedGuildIds||[]),member.guildId, ...Object.keys(counts)].filter(Boolean))],
    lastMessageAt: member.lastMessageAt || null
  };
}
async function sync() {
  if (!api || syncBusy || !client.isReady() || shuttingDown) return;
  syncBusy = true;
  try {
    const guilds = [...client.guilds.cache.values()].slice(0,70).map(guildInfo);
    // Website accepts at most 100 member records per request. A small bot typically fits this.
    const members = Object.values(store.state.members).slice(0,100).map(memberInfo);
    const data = await api.sync(guilds, members);
    lastSync = Date.now();
    console.log('Website synchronisiert:',data.guilds,'Server,',data.members,'Mitglieder');
  } catch (error) {
    console.error('Dashboard Sync fehlgeschlagen:', error.message);
  } finally { syncBusy = false; }
}

async function addGuildMember(guildId, memberId, token) {
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${memberId}`;
  for (let attempt=0; attempt<3; attempt++) {
    const result = await fetch(url, {
      method: 'PUT', headers: { Authorization: 'Bot '+env.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }), signal: AbortSignal.timeout(20000)
    });
    if (result.status === 201) return 'added';
    if (result.status === 204) return 'already';
    const data = await result.json().catch(()=>({}));
    if (result.status === 429 && attempt < 2) {
      await sleep(Math.max(1000, Math.min(10000, (Number(data.retry_after)||1) * 1000)));
      continue;
    }
    throw new Error('Discord HTTP '+result.status+(data.message ? ': '+String(data.message).slice(0,110) : ''));
  }
  throw new Error('Discord rate limit');
}

async function executeJob(job) {
  const target = id(job.guildId);
  if (!target || !client.guilds.cache.has(target)) return { ok:false, error:'Bot ist auf dem Zielserver nicht vorhanden', completed:[], failed:[] };
  if (!store.state.guilds[target]?.allowTransfer) return { ok:false, error:'Zielserver ist nicht für Transfers freigegeben', completed:[], failed:[] };
  const guild = client.guilds.cache.get(target);
  const botMember = await guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionsBitField.Flags.CreateInstantInvite)) return { ok:false, error:'Create Instant Invite Berechtigung fehlt', completed:[], failed:[] };
  if (!oauth) return {ok:false,error:'DISCORD_CLIENT_SECRET für optionale Transfer-Zustimmung fehlt',completed:[],failed:[]};
  const requestedIds = Array.isArray(job.memberIds) ? [...new Set(job.memberIds.map(id).filter(Boolean))].slice(0,100) : [];
  const completed = [], failed = [];
  for (const memberId of requestedIds) {
    const member = store.state.members[memberId];
    if (!member?.transfer?.allowedTargets?.includes(target)) { failed.push({ id: memberId, error:'Keine Einwilligung für diesen Zielserver' }); continue; }
    try {
      const accessToken = await oauth.freshAccess(member);
      const outcome = await addGuildMember(target, memberId, accessToken);
      completed.push({ id: memberId, status: outcome });
    } catch (err) { failed.push({ id: memberId, error: String(err.message).slice(0,130) }); }
    await sleep(1100); // avoid Discord abuse/rate limits
  }
  return { ok:true, completed, failed, finishedAt: Date.now() };
}
async function checkJobs() {
  if (!api || jobsBusy || !client.isReady() || shuttingDown) return;
  jobsBusy = true;
  try {
    const response = await api.jobs();
    for (const candidate of (response.jobs || []).slice(0,3)) {
      const job = normalizeJob(candidate);
      if (!job) { console.warn('Ungültiger Transferauftrag in Website-Antwort'); continue; }
      if (store.state.completedJobs?.[job.id]) {
        await api.result(job.id, store.state.completedJobs[job.id].results).catch(err => console.error('Resultat erneut senden:', err.message));
        continue;
      }
      const outcome = await executeJob({ guildId: job.guildId, memberIds: job.userIds })
        .catch(err => ({ok:false,error:String(err.message).slice(0,150),completed:[],failed:[]}));
      const results = resultsForWebsite(job, outcome);
      // Persist before acknowledging: a retry won't add users twice.
      store.state.completedJobs = store.state.completedJobs || {};
      store.state.completedJobs[job.id] = { finishedAt: Date.now(), results };
      const entries = Object.keys(store.state.completedJobs);
      if (entries.length > 200) for (const old of entries.slice(0,entries.length-200)) delete store.state.completedJobs[old];
      await store.persist();
      await api.result(job.id, results).catch(err => console.error('Transferresultat konnte nicht gespeichert werden:',err.message));
    }
  } catch (err) { if (!String(err.message).includes('HTTP 404')) console.error('Transfer-Abruf fehlgeschlagen:',err.message); }
  finally { jobsBusy = false; }
}

const commands = [
  new SlashCommandBuilder().setName('verify').setDescription('Dich direkt über Discord verifizieren'),
  new SlashCommandBuilder().setName('verify-panel').setDescription('Individuelles Verify-Panel senden (Admin)'),
  new SlashCommandBuilder().setName('update-status').setDescription('Zeigt die automatische Bot-Update-Verbindung (Admin)'),
  new SlashCommandBuilder().setName('update-verbinden').setDescription('Website-Verbindung für sichere Auto-Updates herstellen (Owner)'),
  new SlashCommandBuilder().setName('novora-updates').setDescription('Die Änderungen der letzten Novora-Versionen anzeigen'),
  new SlashCommandBuilder().setName('owner-alerts').setDescription('Private Owner-Benachrichtigungen einstellen (Admin)')
    .addStringOption(o=>o.setName('aktion').setDescription('Aktion').setRequired(true).addChoices({name:'Aktivieren',value:'enable'},{name:'Deaktivieren',value:'disable'},{name:'Stummschalten',value:'mute'},{name:'Stummschaltung aufheben',value:'unmute'},{name:'Status',value:'status'},{name:'Testnachricht',value:'test'}))
    .addStringOption(o=>o.setName('typ').setDescription('Benachrichtigungstyp für Mute').setRequired(false).addChoices({name:'Kritische Warnungen',value:'critical'},{name:'Rollenänderungen',value:'roles'},{name:'Moderation',value:'moderation'},{name:'Server und Webhooks',value:'system'})),
  new SlashCommandBuilder().setName('oauth-status').setDescription('Deine OAuth2-Zustimmung und erlaubten Zielserver anzeigen'),
  new SlashCommandBuilder().setName('logs-setup').setDescription('Sicherheitsprotokoll in diesem Kanal aktivieren (Admin)').addChannelOption(o=>o.setName('kanal').setDescription('Zielkanal für Sicherheitslogs').setRequired(true)).addStringOption(o=>o.setName('stufe').setDescription('Ab welcher Priorität melden').setRequired(false).addChoices({name:'Alle Ereignisse',value:'info'},{name:'Warnungen und kritisch',value:'warning'},{name:'Nur kritisch',value:'critical'})),
  new SlashCommandBuilder().setName('logs-view').setDescription('Letzte 8 Sicherheitsereignisse (Audit-Log-Recht)'),
  new SlashCommandBuilder().setName('logs-check').setDescription('Manipulationsprüfung des Sicherheitsprotokolls (Admin)'),
  new SlashCommandBuilder().setName('logs-export').setDescription('Rollen- und Sicherheitslog exportieren (Admin)'),
  new SlashCommandBuilder().setName('novora-emojis').setDescription('Einmalig Novora Application Emojis erstellen (App-Eigentümer)'),
  new SlashCommandBuilder().setName('verify-role').setDescription('Rolle nach erfolgreicher Verifizierung setzen (Admin)').addRoleOption(o=>o.setName('rolle').setDescription('Die Rolle, die vergeben wird').setRequired(true)),
  new SlashCommandBuilder().setName('verify-remove-role').setDescription('Rolle wählen, die nach Verify entfernt wird; ohne Rolle deaktivieren (Admin)').addRoleOption(o=>o.setName('rolle').setDescription('Zu entfernende Rolle (leer = deaktivieren)').setRequired(false)),
  new SlashCommandBuilder().setName('website-verbinden').setDescription('Einmaligen Website-Verbindungscode anzeigen (Admin)'),
  new SlashCommandBuilder().setName('dashboard-rollen').setDescription('Rollenverwaltung für diesen Server im Dashboard freischalten (Admin)'),
  new SlashCommandBuilder().setName('transfer-allow').setDescription('Diesen Server für freiwillige Member-Transfers freigeben (Admin)').addBooleanOption(o=>o.setName('aktiv').setDescription('Transferziel freigeben').setRequired(true)),
  new SlashCommandBuilder().setName('transfer-consent').setDescription('Discord OAuth2 für freiwillige Serverbeitritte erlauben'),
  new SlashCommandBuilder().setName('transfer-revoke').setDescription('Gespeicherte Transfer-Zustimmung und Tokens zurückziehen'),
  new SlashCommandBuilder().setName('transfer-user').setDescription('Nutzer mit vorheriger Zustimmung übernehmen (Admin)').addStringOption(o=>o.setName('discord_id').setDescription('Discord-ID').setRequired(true)),
  ...rpSuite.commands,
  ...standardSuite.commands,
  setupCommand
].filter(command=>['verify','website-verbinden','dashboard-rollen','transfer-revoke','oauth-status','novora-updates','owner-alerts','logs-view','logs-check','logs-export','update-status','update-verbinden','rp-start','rp-ende','rp-status',...standardSuite.commands.map(c=>c.toJSON().name)].includes(command.toJSON().name)).map(command => command.toJSON());
function verifyCommandPayload(command) {
  const checked = new Set();
  for (const opt of (command.options || [])) {
    if (checked.has(opt.name)) throw Error('Doppelter Slash-Unterbefehl: '+command.name+' '+opt.name);
    checked.add(opt.name);
    const subOptions = new Set();
    for (const child of (opt.options || [])) {
      if (subOptions.has(child.name)) throw Error('Doppelte Slash-Option: '+opt.name+' '+child.name);
      subOptions.add(child.name);
    }
  }
  return command;
}
async function registerGuildSetup(guild){
  // Single scope for /setup: guild-only. Replaces stale guild commands for *this app*.
  // Other Discord bots and their commands are not affected.
  const payload=verifyCommandPayload(setupCommand.toJSON());
  try {
    await client.rest.put(Routes.applicationGuildCommands(env.clientId,guild.id),{body:[payload]});
    console.log('Novora /setup als einziger Server-Setup-Befehl registriert: '+guild.name+' ('+guild.id+')');
  }catch(err){
    console.error('Server-Setup-Registrierung fehlgeschlagen ('+guild.id+'):',err.rawError?.message||err.message,
      err.rawError?.errors?JSON.stringify(err.rawError.errors).slice(0,1000):'');
  }
}
async function setupCommands(){
  // Global is exclusive of /setup so Discord will not show it twice.
  commands.forEach(verifyCommandPayload);
  const names=commands.map(c=>c.name);
  if(names.includes('setup')||new Set(names).size!==names.length)throw Error('Doppelte/global registrierte Setup-Befehle');
  // Remove obsolete global /setup plus retired legacy configuration commands.
  try {
    await client.rest.put(Routes.applicationCommands(env.clientId),{body:commands});
    console.log('Globale Novora-Befehle aktualisiert (ohne /setup): '+names.join(', '));
  }catch(err){console.error('Globale Slash-Registrierung fehlgeschlagen:',err.rawError?.message||err.message,
    err.rawError?.errors?JSON.stringify(err.rawError.errors).slice(0,1000):'');}
  // Bulk overwrite ensures stale local copies of the same commands disappear.
  for(const guild of client.guilds.cache.values())await registerGuildSetup(guild);
}
function allowedTransferTargets(sourceGuildId) {
  return [...client.guilds.cache.values()]
    .filter(g => g.id !== sourceGuildId && store.state.guilds[g.id]?.allowTransfer)
    .slice(0, 20);
}
function verifyPanel(guild) {
  const targets=allowedTransferTargets(guild.id);
  const design=defaults(store.state.guilds[guild.id]||{});
  const qty=Object.values(store.state.members).filter(m=>(m.verifiedGuildIds||[]).includes(guild.id)).length;
  const emoji=ui.customEmoji(store.state.appEmojis,'nv_verify','🛡️');
  const button=new ButtonBuilder().setLabel(design.verifyButtonLabel==='Direkt verifizieren'?'Mit Discord autorisieren':design.verifyButtonLabel)
   .setStyle(ButtonStyle.Link).setURL(env.publicUrl+'/oauth/start?guild='+guild.id).setDisabled(design.verificationPaused);
  if(store.state.appEmojis?.nv_verify)button.setEmoji({name:'nv_verify_flat',id:store.state.appEmojis.nv_verify});
  const lines=[
   `# ${emoji} ${serverTitle(guild.name)} | Verifizierung`,
   design.verificationPaused?'Die Verifizierung ist vorübergehend pausiert.':(design.panelDescription||'Bestätige deinen Discord-Account, um Zugriff auf unseren Server zu erhalten.'),
   `**${qty.toLocaleString('de-DE')} Mitglieder bereits verifiziert**`,
  ];
  if(targets.length)lines.push('Mit deiner Discord-Autorisierung können gemäß den angezeigten Berechtigungen auch Beitritte zu freigegebenen Community-Servern ermöglicht werden.');
  return ui.payload({color:0x7C67E5,lines,banner:'novora-panel-verify.png',rows:[[button]]});
}

function verifySuccess(user, member, gid) {
  const old=store.state.members[user.id]||{};
  store.state.members[user.id] = {...old, id:user.id, username:user.username, displayName:member.displayName || user.globalName || user.username,
    avatar: user.displayAvatarURL({extension:'png',size:128}), verifiedAt:Date.now(), guildId:gid,
    verifiedGuildIds:[...new Set([...(old.verifiedGuildIds||[]),gid])], counts:old.counts||{}};
  return store.state.members[user.id];
}
async function sendVerifyPanel(interaction){
  const gid=interaction.guildId;
        if (!oauth) return interaction.reply({content:'Discord OAuth2 ist noch nicht eingerichtet. Bitte DISCORD_CLIENT_SECRET in BotHosting setzen.',flags:MessageFlags.Ephemeral});
        if (!store.state.guilds[gid]?.roleId) return interaction.reply({content:'Bitte `/setup` → Verifizierung einrichten.',flags:MessageFlags.Ephemeral});
        if(store.state.guilds[gid]?.brandingApproved===undefined){
          store.state.guilds[gid].pendingPanelChannelId=interaction.channelId;
          await store.persist();
          return interaction.reply({content:'**Design für '+interaction.guild.name+' übernehmen?**\nIch kann den Namen und das Serverbild ausschließlich für mein Bot-Profil auf diesem Server verwenden. Du kannst auch das neutrale Novora-Design behalten.',
            components:[new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('nvbrand:yes:'+gid).setLabel('Server-Design erlauben').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('nvbrand:no:'+gid).setLabel('Novora-Design behalten').setStyle(ButtonStyle.Secondary)
            )],flags:MessageFlags.Ephemeral});
        }
        let sent=null;
        const previous=store.state.guilds[gid];
        if(previous?.panelChannelId===interaction.channelId && previous?.panelMessageId){
          const msg=await interaction.channel.messages.fetch(previous.panelMessageId).catch(()=>null);
          if(msg)sent=await ui.publish(interaction.channel,decorate(verifyPanel(interaction.guild),'verify',msg,interaction.guild.name),msg);
        }
        if(!sent)sent=await interaction.channel.send(decorate(verifyPanel(interaction.guild),'verify',null,interaction.guild.name));
        store.state.guilds[gid]={...store.state.guilds[gid],panelMessageId:sent.id,panelChannelId:sent.channelId};
        recordAudit(store,{guildId:gid,action:'panel_sent',actorId:interaction.user.id,details:sent.id});
        await store.persist();
        return interaction.reply({content:'✅ Individuelles Verify-Panel für **'+interaction.guild.name+'** wurde gesendet.',flags:MessageFlags.Ephemeral});
}
// The setup wizard calls the same validated handlers as the old slash subcommands.
// Replies are routed to the already-deferred private wizard message.
const setupFlow=makeSetupFlow(async (i,mode,values)=>{
  const gid=i.guildId,guild=i.guild;
  const getChannel=async k=>values[k]?guild.channels.cache.get(values[k])||await guild.channels.fetch(values[k]).catch(()=>null):null;
  const channels={};
  for(const [key,value] of Object.entries(values)){
    if(!value||['team','partnerrolle','pingrolle','rolle','entfernen','system','beschwerdeteam','beschwerdeteam'].includes(key))continue;
    channels[key]=await getChannel(key);
  }
  const getRole=k=>values[k]?guild.roles.cache.get(values[k])||null:null;
  const setupDisplay=(input)=>{
    const data=typeof input==='string'?{content:input}:input||{};
    if((data.flags&ui.FLAG)===ui.FLAG)return data;
    const lines=[];
    if(data.content)lines.push(data.content);
    for(const e of data.embeds||[]){
      const raw=e?.data||e||{};
      if(raw.title)lines.push('# '+raw.title);
      if(raw.description)lines.push(raw.description);
      for(const f of raw.fields||[])lines.push('**'+f.name+'**\n'+f.value);
    }
    const rows=(data.components||[]).map(r=>r.components||[]).filter(x=>x.length);
    return ui.payload({color:0x6475DF,lines:lines.length?lines:['Einrichtung abgeschlossen.'],rows});
  };
  const facade={
    guild,guildId:gid,user:i.user,memberPermissions:i.memberPermissions,
    inGuild:()=>i.inGuild(),
    channel:i.channel,channelId:i.channelId,
    options:{getChannel:k=>channels[k]||null,getRole,getString:k=>values[k]||null},
    reply:async payload=>i.editReply(setupDisplay(payload)),
    deferReply:async()=>{},
    editReply:async payload=>i.editReply(setupDisplay(payload))
  };
  const done=async txt=>i.editReply(setupDisplay(txt));
  if(mode==='tickets')return supportSuite.setupTickets(facade);
  if(mode==='voice')return supportSuite.setupVoice(facade);
  if(mode==='partnerschaft')return partnershipSystem.setup(facade);
  if(mode==='application'||mode==='faction')return done(await communitySuite.applySetup(i,mode,values));
  if(mode==='welcome'){await memberGreetings.configure(gid,{welcomeId:values.willkommen,leaveId:values.abschied});return done('Willkommens- und Abschiedsnachrichten eingerichtet. Für Join-/Leave-Nachrichten im Discord Developer Portal „Server Members Intent“ aktivieren und `ENABLE_MEMBER_EVENTS=true` in der vorhandenen .env setzen; sonst bleibt der Bot sicher ohne dieses Ereignis aktiv.');}
  if(mode==='verify'){
    const role=getRole('rolle'),remove=getRole('entfernen');
    const me=await guild.members.fetchMe();
    if(!role||role.managed||role.id===gid||role.position>=me.roles.highest.position||!me.permissions.has(PermissionsBitField.Flags.ManageRoles))throw Error('Die Verify-Rolle muss unter der Bot-Rolle liegen; der Bot braucht Rollen verwalten.');
    if(remove&&(remove.id===role.id||remove.managed||remove.id===gid||remove.position>=me.roles.highest.position))throw Error('Die optionale zu entfernende Rolle ist nicht bearbeitbar.');
    store.state.guilds[gid]={...(store.state.guilds[gid]||{}),roleId:role.id,removeRoleId:remove?.id||null};
    await store.persist();
    if(channels.kanal){facade.channel=channels.kanal;facade.channelId=channels.kanal.id;return sendVerifyPanel(facade);}
    return done('Verifizierung eingerichtet: <@&'+role.id+'>. Öffne erneut `/setup` → „Panel veröffentlichen“, um das Verify-Panel zu senden.');
  }
  if(mode==='panel'){
    const type=values.system;const target=channels.kanal;
    if(!target?.send)throw Error('Bitte einen Textkanal für das Panel auswählen.');
    facade.channel=target;facade.channelId=target.id;
    if(type==='tickets'){
      const cfg=store.state.supportSettings?.[gid]?.tickets;
      if(cfg&&cfg.panelId!==target.id){cfg.panelId=target.id;cfg.panelMessageId=null;await store.persist();}
      return supportSuite.sendTicketPanel(facade);
    }
    if(type==='partnerschaft'){
      const cfg=store.state.partnershipSettings?.[gid];
      if(cfg&&cfg.panelChannelId!==target.id){cfg.panelChannelId=target.id;cfg.panelMessageId=null;await store.persist();}
      return partnershipSystem.sendPanel(facade);
    }
    if(type==='application'||type==='faction'){const cfg=communitySuite.settings(gid,type);
      if(cfg&&cfg.panelId!==target.id){cfg.panelId=target.id;cfg.panelMessageId=null;await store.persist();}
      const m=await communitySuite.publishPanel(guild,type);return done('Panel veröffentlicht in <#'+m.channelId+'>.');}
    if(type==='verify')return sendVerifyPanel(facade);
    throw Error('Unbekannter Paneltyp.');
  }
  if(mode==='logs'){
    const ch=channels.kanal,me=await guild.members.fetchMe();
    if(!ch?.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.EmbedLinks]))throw Error('Bot kann in diesem Logkanal nicht schreiben.');
    store.state.guilds[gid]={...(store.state.guilds[gid]||{}),logChannelId:ch.id,logMinLevel:'info'};
    await store.persist();return done('Sicherheitslogs eingerichtet: <#'+ch.id+'>.');
  }
  if(mode==='emojis'){
    const app=await client.application.fetch();
    if(!isApplicationOwner(app,i.user.id))throw Error('Nur der Eigentümer der Discord-Anwendung darf Application-Emojis installieren.');
    const current=await uploadEmoji(client,store),partner=await uploadPartnershipEmojis(store);
    return done('Novora-Emojis eingerichtet: '+Object.keys(current).length+' Symbole + '+Object.keys(partner).length+' Partnerschaftssymbole.');
  }
  if(mode==='panelrefresh'){
    const cfg=store.state.guilds[gid]||{};
    const entries=[];
    const verify=await refreshSavedPanel({guild,channelId:cfg.panelChannelId,messageId:cfg.panelMessageId,
      makePayload:old=>decorate(verifyPanel(guild),'verify',old,guild.name),
      onReplaced:async id=>{cfg.panelMessageId=id;store.state.guilds[gid]=cfg;await store.persist();}})
      .catch(e=>({status:'failed',reason:String(e.message).slice(0,140)}));
    entries.push(['Verifizierung',verify]);
    const partner=await partnershipSystem.updatePublishedPanel(guild).catch(e=>({status:'failed',reason:String(e.message).slice(0,140)}));
    entries.push(['Partnerschaften',partner]);
    const tickets=await supportSuite.updatePublishedPanel(guild).catch(e=>({status:'failed',reason:String(e.message).slice(0,140)}));
    entries.push(['Tickets',tickets]);
    const applications=await communitySuite.refreshPanel(guild,'application').catch(e=>({status:'failed',reason:String(e.message).slice(0,140)}));
    const factions=await communitySuite.refreshPanel(guild,'faction').catch(e=>({status:'failed',reason:String(e.message).slice(0,140)}));
    entries.push(['Bewerbungen',applications],['Fraktionen',factions]);
    const results=summarizePanels(entries);
    store.state.panelRegistry ||= {};
    store.state.panelRegistry[gid] ||= {};
    const metadata=[['verify',verify,cfg.panelChannelId],['partnerschaft',partner,store.state.partnershipSettings?.[gid]?.panelChannelId],['tickets',tickets,store.state.supportSettings?.[gid]?.tickets?.panelId],
      ['application',applications,communitySuite.settings(gid,'application')?.panelId],['faction',factions,communitySuite.settings(gid,'faction')?.panelId]];
    for(const [type,result,channelId] of metadata){
      if(result.status==='updated')store.state.panelRegistry[gid][type]={
        guildId:gid,channelId,messageId:result.id,type,version:VERSION,updatedAt:Date.now()
      };
    }
    recordAudit(store,{guildId:gid,actorId:i.user.id,action:'all_panels_refresh',details:`${results.updated} aktualisiert, ${results.failed} fehlgeschlagen`});
    await store.persist();
    return done(`**Novora · Panel-Aktualisierung abgeschlossen**\n✅ **${results.updated}** aktualisiert · **${results.skipped}** noch nicht eingerichtet · **${results.failed}** Fehler\n\n${results.lines.join('\n')}\n\nDie vorhandenen Panelnachrichten wurden aktualisiert; fehlende Panels wurden nicht automatisch neu erstellt.`);
  }
  if(mode==='partnersync'){
    const result=await partnershipSystem.refreshCounts(gid,40);
    return done('Partnerschaften synchronisiert: '+result.checked+' geprüft, '+result.updated+' aktualisiert, '+result.errors+' Fehler.');
  }
  if(mode==='status'){
    const st=supportSuite.config(gid);const p=partnershipSystem.configFor(gid);
    return done('**Novora · Systemstatus**\nVerify: '+(store.state.guilds[gid]?.roleId?'Aktiv':'Nicht eingerichtet')+
      '\nTickets: '+(st.tickets?'Aktiv':'Nicht eingerichtet')+'\nVoice: '+(st.voice?'Aktiv':'Nicht eingerichtet')+
      '\nPartnerschaften: '+(p?'Aktiv':'Nicht eingerichtet')+'\nSicherheitslogs: '+(store.state.guilds[gid]?.logChannelId?'Aktiv':'Nicht eingerichtet'));
  }
  throw Error('Unbekanntes Setup-System');
},{getEmojis:()=>store.state.appEmojis||{},getPanelOverview:async guild=>{
  const gid=guild.id;
  const v=store.state.guilds[gid]||{};
  const t=store.state.supportSettings?.[gid]?.tickets||{};
  const p=store.state.partnershipSettings?.[gid]||{};
  const a=communitySuite.settings(gid,'application')||{},f=communitySuite.settings(gid,'faction')||{};
  const records=[['Verify',v.panelChannelId,v.panelMessageId],['Tickets',t.panelId,t.panelMessageId],['Partnerschaften',p.panelChannelId,p.panelMessageId],['Bewerbungen',a.panelId,a.panelMessageId],['Fraktionen',f.panelId,f.panelMessageId]];
  const output=[];
  for(const [name,channelId,messageId] of records){
    if(!channelId||!messageId){output.push(`• **${name}:** Nicht veröffentlicht`);continue;}
    const channel=await guild.channels.fetch(channelId).catch(()=>null);
    if(!channel?.messages?.fetch){output.push(`• **${name}:** ⚠️ Kanal fehlt oder nicht lesbar`);continue;}
    const message=await channel.messages.fetch(messageId).catch(()=>null);
    output.push(`• **${name}:** ${message?'✅ Gefunden in <#'+channelId+'>':'⚠️ Gespeicherte Nachricht fehlt'}`);
  }
  return output;
}});
client.on(Events.InteractionCreate, async interaction => {
  try {
    if(interaction.isChatInputCommand()&&interaction.commandName==='setup')return setupFlow.open(interaction);
    if(await setupFlow.onInteraction(interaction))return;
    if(await standardSuite.onInteraction(interaction))return;
    if((interaction.isChatInputCommand() && rpSuite.commands.some(c=>c.toJSON().name===interaction.commandName)) || (interaction.isModalSubmit?.() && interaction.customId==='nvrp:report')){await rpSuite.onInteraction(interaction);return;}
    if(await supportSuite.onInteraction(interaction))return;
    if(await communitySuite.onInteraction(interaction))return;
    if(await partnershipSystem.onInteraction(interaction))return;
    if(interaction.isButton() && interaction.customId.startsWith('nvbrand:')){
      if(!interaction.inGuild()||!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
        return interaction.reply({content:'Nur Server-Administratoren.',flags:MessageFlags.Ephemeral});
      const parts=interaction.customId.split(':');
      if(parts[2]!==interaction.guildId)return interaction.reply({content:'Falscher Server.',flags:MessageFlags.Ephemeral});
      const approved=parts[1]==='yes';
      const cfg=store.state.guilds[interaction.guildId]||{};
      cfg.brandingApproved=approved;store.state.guilds[interaction.guildId]=cfg;
      let note='';
      if(approved){const v=await applyBranding(interaction.guild,true).catch(e=>({error:e.message}));note=v.error?' Design konnte nicht vollständig übernommen werden: '+v.error:' Bot-Profil wurde angepasst.';}
      const target=await interaction.guild.channels.fetch(cfg.pendingPanelChannelId||interaction.channelId).catch(()=>null);
      if(!target?.send)throw Error('Panelkanal nicht verfügbar.');
      const sent=await target.send(decorate(verifyPanel(interaction.guild),'verify',null,interaction.guild.name));
      cfg.panelMessageId=sent.id;cfg.panelChannelId=sent.channelId;delete cfg.pendingPanelChannelId;
      recordAudit(store,{guildId:interaction.guildId,action:'panel_branding',actorId:interaction.user.id,details:approved?'erlaubt':'abgelehnt'});
      await store.persist();
      return interaction.update({content:'Panel gesendet.'+(approved?' Server-Design erlaubt.':' Novora-Design beibehalten.')+note,components:[]});
    }
    if (interaction.isButton() && interaction.customId.startsWith('nvrole:')) {
      await roleAdmin.onButton(interaction);return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('nv_verify:')) {
      if (!interaction.inGuild() || interaction.customId !== 'nv_verify:'+interaction.guildId) return interaction.reply({ content:'Dieses Panel gehört zu einem anderen Server.',flags:MessageFlags.Ephemeral });
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const guild=interaction.guild;
      const cfg=store.state.guilds[guild.id]||{};
      if(cfg.verificationPaused)return interaction.editReply('⏸️ Verifizierung ist auf diesem Server gerade pausiert.');
      if (!cfg.roleId) return interaction.editReply('Das Team muss zuerst `/setup` → Verifizierung einrichten.');
      return interaction.editReply('Öffne bitte das aktuelle Verify-Panel und autorisiere Novora über Discord. Erst danach wird die Rolle vergeben.');
    }
    if (interaction.isChatInputCommand()) {
      if (!interaction.inGuild()) return interaction.reply({content:'Nur auf einem Server verfügbar.',flags:MessageFlags.Ephemeral});
      const gid=interaction.guildId;
      if (interaction.commandName === 'verify') {
        await interaction.deferReply({flags:MessageFlags.Ephemeral});
        return interaction.editReply('Bitte nutze den Link „Mit Discord autorisieren“ im Verify-Panel. Nach der Discord-Freigabe wird die Rolle automatisch vergeben.');
      }
      if (interaction.commandName === 'oauth-status') {
        const member=store.state.members[interaction.user.id];
        const grants=(member?.transfer?.allowedTargets||[]).filter(g=>client.guilds.cache.has(g))
          .map(g=>client.guilds.cache.get(g).name);
        return interaction.reply({content:member?.transfer?.access
          ?'**Discord-OAuth2: autorisiert**\nScopes: identify, guilds, guilds.join\nFreigegebene Transferziele: '+(grants.join(', ')||'Keine')+'\nFreigabe jederzeit mit `/transfer-revoke` widerrufen.'
          :'**Keine aktive Transfer-Zustimmung.** Öffne das Verify-Panel für die offizielle Discord-Autorisierung.',flags:MessageFlags.Ephemeral});
      }
      if(interaction.commandName==='novora-updates'){
        const items=updateHistory(env.dataDir).releases.slice(0,4);
        const text=items.map(x=>'**V'+x.version+' · '+x.title+'**\n'+x.changes.slice(0,4).map(y=>'• '+y).join('\n')).join('\n\n');
        return interaction.reply({content:text.slice(0,1900),flags:MessageFlags.Ephemeral});
      }
      if (interaction.commandName === 'transfer-revoke') {
        const previous=store.state.members[interaction.user.id];
        let discordRevoked=false;
        if (previous?.transfer && oauth) discordRevoked=await oauth.revoke(previous).catch(()=>false);
        if (previous?.transfer) {
          previous.transfer=null;
          await store.persist();
        }
        return interaction.reply({content:discordRevoked?'✅ Transfer-Zustimmung gelöscht und Discord-Autorisierung widerrufen.':'✅ Deine beim Bot gespeicherte Transfer-Zustimmung wurde gelöscht. Entferne die Anwendung zusätzlich unter **Discord → Benutzereinstellungen → Autorisierte Apps**, um den Discord-Zugriff zu widerrufen.',flags:MessageFlags.Ephemeral});
      }
      if (interaction.commandName === 'transfer-consent') {
        const targets=allowedTransferTargets(gid);
        if (!oauth || !targets.length) return interaction.reply({content:'Es sind noch keine freigegebenen Community-Zielserver bzw. OAuth2-Zugangsdaten verfügbar.',flags:MessageFlags.Ephemeral});
        return interaction.reply({content:'**Optional: Discord-Autorisierung für Serverbeitritte**\nFreigegebene Ziele: '+targets.map(g=>g.name).join(', ').slice(0,500)+'\nÖffne den Link, wenn du freiwillig späteren Serverbeitritten zustimmst: '+env.publicUrl+'/oauth/start?guild='+gid+'\nDu kannst dies später mit `/transfer-revoke` widerrufen.',flags:MessageFlags.Ephemeral});
      }
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({content:'Nur Server-Administratoren.',flags:MessageFlags.Ephemeral});
      if(interaction.commandName==='owner-alerts'){
        const action=interaction.options.getString('aktion');
        const category=interaction.options.getString('typ');
        if(action==='status'){
          const result=await ownerAlerts.get(gid,interaction.user.id);
          return interaction.reply({content:'**Private Owner-Warnungen**\n'+(result.profile.enabled?'Aktiv':'Deaktiviert')+'\n'+result.categories.map(x=>(result.profile.muted.includes(x.id)?'🔕 ':'🔔 ')+x.label).join('\n'),flags:MessageFlags.Ephemeral});
        }
        if(action==='test'){
          const current=await ownerAlerts.get(gid,interaction.user.id);
          if(!current.profile.enabled)return interaction.reply({content:'Bitte zuerst private Benachrichtigungen aktivieren.',flags:MessageFlags.Ephemeral});
          try{await interaction.user.send({content:'Novora Verify · Test deiner privaten Owner-Benachrichtigungen auf **'+interaction.guild.name+'**.'});
          return interaction.reply({content:'Testnachricht per DM gesendet.',flags:MessageFlags.Ephemeral});}
          catch{return interaction.reply({content:'DM nicht möglich. Bitte private Nachrichten erlauben.',flags:MessageFlags.Ephemeral});}
        }
        const result=await ownerAlerts.update(gid,interaction.user.id,{action,category});
        return interaction.reply({content:result.notice,flags:MessageFlags.Ephemeral});
      }
      if(interaction.commandName==='logs-setup') {
        const channel=interaction.options.getChannel('kanal');
        if(!channel?.send||!channel.isTextBased())return interaction.reply({content:'Bitte einen Textkanal auswählen.',flags:MessageFlags.Ephemeral});
        const bot=await interaction.guild.members.fetchMe();
        if(!channel.permissionsFor(bot)?.has([PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.EmbedLinks]))
          return interaction.reply({content:'Der Bot benötigt „Kanal ansehen“, „Nachrichten senden“ und „Links einbetten“.',flags:MessageFlags.Ephemeral});
        const cfg=store.state.guilds[gid]||{};
        cfg.logChannelId=channel.id;cfg.logMinLevel=interaction.options.getString('stufe')||'info';
        store.state.guilds[gid]=cfg;await store.persist();
        return interaction.reply({content:'**Novora Security Logs aktiviert** in <#'+channel.id+'>. Stufe: '+cfg.logMinLevel+'\nDas zusätzliche Prüfprotokoll liegt unter `data/security-logs/`. Discord-Meldungen sind nicht unlöschbar.',flags:MessageFlags.Ephemeral});
      }
      if(['logs-view','logs-check','logs-export'].includes(interaction.commandName)){
        const inspected=await security.status(gid,interaction.user.id).catch(e=>({ok:false,error:e.message}));
        if(inspected.error&&!inspected.ok)return interaction.reply({content:'Sicherheitsprüfung: '+inspected.error,flags:MessageFlags.Ephemeral});
        if(interaction.commandName==='logs-check')return interaction.reply({content:'**Sicherheitsjournal**\nPrüfung: '+(inspected.ok?'✅ Hashkette gültig':'⚠️ Manipulation möglich')+'\nEinträge: '+inspected.count+'\nLetzte Prüfsumme: `'+inspected.hash.slice(0,20)+'…`\nLokaler Speicher ist nicht gegen Löschung durch Hosting-Administratoren geschützt.',flags:MessageFlags.Ephemeral});
        if(interaction.commandName==='logs-view'){
          const recent=await security.list(gid,interaction.user.id,{limit:8});
          const text=recent.items.map(x=>'`'+x.level+'` '+new Date(x.createdAt).toLocaleString('de-DE')+' · '+x.summary+' · Verantwortlich: '+(x.actorId?'<@'+x.actorId+'>':'unbekannt')).join('\n');
          return interaction.reply({content:(text||'Noch keine Sicherheitsereignisse.').slice(0,1900),allowedMentions:{parse:[]},flags:MessageFlags.Ephemeral});
        }
        const content=security.exportText(gid);
        if(content.length>7*1024*1024)return interaction.reply({content:'Das Protokoll ist zu groß für Discord. Bitte lokal über `data/security-logs/` sichern.',flags:MessageFlags.Ephemeral});
        return interaction.reply({content:'Sicherheitsprotokoll (hashverkettet; nicht unveränderbar).',files:[{attachment:content,name:'novora-security-'+gid+'.jsonl'}],flags:MessageFlags.Ephemeral});
      }
      if(interaction.commandName==='update-status'){
        let info={enabled:process.env.NOVORA_AUTO_UPDATE!=='false',currentVersion:VERSION};
        try{info={...info,...JSON.parse(require('node:fs').readFileSync(path.join(env.dataDir,'update-status.json'),'utf8'))}}catch{}
        const when=info.lastInstalled?new Date(info.lastInstalled).toLocaleString('de-DE'):'Noch kein Update installiert';
        return interaction.reply({content:'**Novora Auto-Update**\nVersion: `'+VERSION+'`\nAutomatisch: **'+(info.enabled?'Aktiv':'Deaktiviert')+'**\nLetztes Update: '+when+(info.error?'\nHinweis: '+String(info.error).slice(0,160):''),flags:MessageFlags.Ephemeral});
      }
      if(interaction.commandName==='novora-emojis'){
        const app=await client.application.fetch();
        if(!isApplicationOwner(app,interaction.user.id))return interaction.reply({content:'Nur der Eigentümer der Discord-Anwendung kann Emojis installieren.',flags:MessageFlags.Ephemeral});
        await interaction.deferReply({flags:MessageFlags.Ephemeral});
        const items=await uploadEmoji(client,store);
        const all=await uploadPartnershipEmojis(store);
        return interaction.editReply('Novora Application Emojis eingerichtet: '+Object.keys(all).join(', '));
      }
      if(interaction.commandName==='verify-panel')return sendVerifyPanel(interaction);
      if (interaction.commandName === 'website-verbinden' || interaction.commandName === 'update-verbinden') {
        // Pairing grants cross-server dashboard access, so guild admin is not sufficient.
        // Fail closed when the Discord application owner cannot be verified.
        const application = await client.application.fetch();
        if (!isApplicationOwner(application, interaction.user.id)) {
          return interaction.reply({content:'Nur der Eigentümer der Discord-Bot-Anwendung darf das Dashboard verbinden.',flags:MessageFlags.Ephemeral});
        }
        const code=bridge.newCode();
        return interaction.reply({content:'**Novora Website & Auto-Updates verbinden**\nGehe auf dein Novora-Dashboard → Einstellungen → Einfach verbinden.\nDie Verbindung erlaubt Statusabfragen; Updates werden weiterhin ausschließlich nach Ed25519-Prüfung installiert.\nDein einmaliger Code: `'+code+'`\nGültig für 10 Minuten. Nicht öffentlich teilen.',flags:MessageFlags.Ephemeral});
      }
      if (interaction.commandName === 'dashboard-rollen') {
        const code=await roleAdmin.issueGuildCode(gid,interaction.user.id);
        return interaction.reply({content:'**Rollenverwaltung für '+interaction.guild.name+'**\nServer-ID: `'+gid+'`\nFreigabecode: `'+code+'`\nDiesen Code im Novora-Dashboard im jeweiligen Nutzerprofil eingeben. Gültig 10 Minuten. Nicht teilen.',flags:MessageFlags.Ephemeral});
      }
      if (interaction.commandName === 'verify-remove-role') {
        const role=interaction.options.getRole('rolle');
        const config=store.state.guilds[gid]||{};
        if (role) {
          if (role.id === config.roleId) return interaction.reply({content:'Diese Rolle wird nach der Verifizierung vergeben und kann nicht zugleich entfernt werden.',flags:MessageFlags.Ephemeral});
          const me=await interaction.guild.members.fetchMe();
          if (role.managed || role.id === gid || !me.permissions.has(PermissionsBitField.Flags.ManageRoles) || role.position>=me.roles.highest.position) return interaction.reply({content:'Diese Rolle kann ich nicht verwalten. Prüfe die Berechtigung und Rollenreihenfolge.',flags:MessageFlags.Ephemeral});
        }
        store.state.guilds[gid]={...config, removeRoleId:role?.id||null};
        recordAudit(store,{guildId:gid,action:'verify_remove_role',actorId:interaction.user.id,details:role?.name||'deaktiviert'});
        await store.persist();
        return interaction.reply({content:role?'Nach der Verifizierung wird '+role.toString()+' entfernt.':'Automatisches Entfernen der Rolle deaktiviert.',flags:MessageFlags.Ephemeral});
      }
      if (interaction.commandName === 'transfer-allow') {
        const active = interaction.options.getBoolean('aktiv',true);
        store.state.guilds[gid] = {...(store.state.guilds[gid]||{}),allowTransfer:active};
        recordAudit(store,{guildId:gid,action:'transfer_target',actorId:interaction.user.id,details:active?'aktiviert':'deaktiviert'});
        await store.persist(); await sync();
        return interaction.reply({content:active?'Dieser Server ist jetzt ein verfügbares Transferziel. Mitglieder können über die optionale Discord-Autorisierung einmal ausdrücklich für die aktuell freigegebenen Ziele zustimmen.':'Dieser Server ist jetzt als Transferziel gesperrt.',flags:MessageFlags.Ephemeral});
      }
      if (interaction.commandName === 'transfer-user') {
        const userId = id(interaction.options.getString('discord_id',true));
        if (!userId) return interaction.reply({content:'Ungültige Discord-ID.',flags:MessageFlags.Ephemeral});
        await interaction.deferReply({flags:MessageFlags.Ephemeral});
        const result = await executeJob({guildId:gid,memberIds:[userId]});
        if (!result.ok) return interaction.editReply('Transfer fehlgeschlagen: '+result.error);
        if (result.failed?.length) return interaction.editReply('Transfer abgelehnt: '+result.failed[0].error);
        return interaction.editReply(result.completed?.[0]?.status==='added'?'Mitglied mit vorheriger Einwilligung hinzugefügt.':'Mitglied ist bereits auf diesem Server.');
      }
      if (interaction.commandName === 'verify-role') {
        const role = interaction.options.getRole('rolle',true);
        const me = await interaction.guild.members.fetchMe();
        if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles) || role.position >= me.roles.highest.position) return interaction.reply({content:'Ich benötige **Rollen verwalten** und meine Bot-Rolle muss über der ausgewählten Rolle stehen.',flags:MessageFlags.Ephemeral});
        if (store.state.guilds[gid]?.removeRoleId === role.id) return interaction.reply({content:'Das ist die zu entfernende Rolle. Bitte zuerst /verify-remove-role ohne Rolle ausführen.',flags:MessageFlags.Ephemeral});
        store.state.guilds[gid] = {...(store.state.guilds[gid]||{}),roleId:role.id};
        recordAudit(store,{guildId:gid,action:'verify_role',actorId:interaction.user.id,details:role.name});
        await store.persist();
        return interaction.reply({content:`Nach erfolgreicher Verifizierung wird ${role} vergeben.`,flags:MessageFlags.Ephemeral});
      }
    }
  } catch (err) {
    console.error('Interaktionsfehler:',err.message);
    if (interaction.isRepliable()) {
      const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
      await interaction[method]({content:'Fehler: '+String(err.message).slice(0,150),flags:MessageFlags.Ephemeral}).catch(()=>{});
    }
  }
});
client.on(Events.MessageCreate, message => {
  if (!message.guildId || message.author.bot) return;
  const member = store.state.members[message.author.id];
  if (!member) return;
  member.counts = member.counts || {};
  member.counts[message.guildId] = (member.counts[message.guildId] || 0) + 1;
  member.channels = member.channels || {};
  const byGuild=member.channels[message.guildId] || (member.channels[message.guildId] = {});
  const channel=byGuild[message.channelId] || (byGuild[message.channelId] = {count:0,lastAt:0});
  channel.count=Math.max(0,Number(channel.count)||0)+1;
  channel.lastAt=message.createdTimestamp||Date.now();
  member.lastMessageAt=channel.lastAt;
  member.recent=member.recent||{};
  const recent=member.recent[message.guildId] || (member.recent[message.guildId]=[]);
  recent.unshift({id:message.id,channelId:message.channelId,at:channel.lastAt});
  member.recent[message.guildId]=recent.filter(item=>item.at>Date.now()-30*86400000).slice(0,20);
  // No message content, attachments, embeds, or private chats are stored.
  scheduleSave();
});
client.once(Events.ClientReady, async () => {
  console.log(`Novora Verify online als ${client.user.tag}. Server: ${client.guilds.cache.size}`);
  await setupCommands();
  await store.persist();
  await sync();
  await checkJobs();
  await supportSuite.shutdownRecovery().catch(e=>console.warn('Support-Wiederherstellung:',e.message));
});
async function refreshVerifyCounters(){
  if(!client.isReady())return;
  for(const guild of client.guilds.cache.values()){
    const cfg=store.state.guilds[guild.id];
    if(!cfg?.panelMessageId||!cfg?.panelChannelId)continue;
    const count=Object.values(store.state.members).filter(m=>(m.verifiedGuildIds||[]).includes(guild.id)).length;
    if(lastDisplayedCounts.get(guild.id)===count)continue;
    const ch=await guild.channels.fetch(cfg.panelChannelId).catch(()=>null);
    if(!ch?.messages)continue;
    await ch.messages.fetch(cfg.panelMessageId).then(m=>ui.publish(ch,decorate(verifyPanel(guild),'verify',m,guild.name),m))
      .then(async m=>{if(m.id!==cfg.panelMessageId){cfg.panelMessageId=m.id;await store.persist();}lastDisplayedCounts.set(guild.id,count);})
      .catch(()=>{});
  }
}
const lastDisplayedCounts=new Map();
setInterval(()=>{void refreshVerifyCounters();},90_000).unref();
client.on(Events.GuildCreate, (guild) => { void registerGuildSetup(guild); void sync(); });
client.on(Events.GuildDelete, () => { void sync(); });

async function memberDetails(userId) {
  const record=store.state.members[userId];
  if (!record) return null;
  const serverIds=[...new Set([...(record.verifiedGuildIds||[]),record.guildId,...Object.keys(record.counts||{})].filter(Boolean))];
  const profiles=[];
  for (const guild of client.guilds.cache.values()) {
    if(profiles.length>=24)break;
    const known=serverIds.includes(guild.id);
    // Avoid treating historical verification/activity as proof of ongoing membership.
    let current=null;
    try { current=await guild.members.fetch({user:userId,force:true}).catch(()=>null); }
    catch { current=null; }
    if(!known&&!current)continue;
    const channels=Object.entries(record.channels?.[guild.id]||{}).map(([channelId,stats])=>{
      const channel=guild.channels.cache.get(channelId);
      return {id:channelId,name:channel?.name||'Unbekannter Kanal',count:Number(stats.count)||0,lastAt:Number(stats.lastAt)||0};
    }).sort((a,b)=>b.count-a.count).slice(0,30);
    const recent=(record.recent?.[guild.id]||[]).filter(msg=>msg.at>Date.now()-30*86400000).slice(0,20).map(msg=>{
      const channel=guild.channels.cache.get(msg.channelId);
      return {id:msg.id,channelId:msg.channelId,channelName:channel?.name||'Unbekannter Kanal',at:msg.at,
        url:'https://discord.com/channels/'+guild.id+'/'+msg.channelId+'/'+msg.id};
    });
    profiles.push({id:guild.id,name:guild.name,icon:guild.iconURL({extension:'png',size:128}),
      verified:!!(record.verifiedGuildIds||[]).includes(guild.id),currentMember:!!current,
      joinedAt:current?.joinedTimestamp||null,nickname:current?.nickname||null,
      roles:current?.roles?.cache?.filter(r=>r.id!==guild.id).map(r=>({id:r.id,name:r.name})).slice(0,30)||[],
      messages:Number(record.counts?.[guild.id]||0),channels,recent});
  }
  return {...memberInfo(record),guilds:profiles};
}
const roleAdmin=makeRoleAdministration({client,store});
const ops={
  async permission(guildId,adminId){
    if(!id(guildId)||!id(adminId))throw new Error('Ungültige Discord-ID');
    const guild=client.guilds.cache.get(guildId);
    if(!guild)throw new Error('Der Bot ist nicht auf diesem Server');
    const member=await guild.members.fetch({user:adminId,force:true}).catch(()=>null);
    if(!member||(guild.ownerId!==adminId&&!member.permissions.has(PermissionsBitField.Flags.Administrator)))throw new Error('Nur Administratoren dieses Servers');
    return guild;
  },
  async read(guildId,adminId){
    try{
      const guild=await this.permission(guildId,adminId);
      return {status:200,body:{ok:true,guildId,config:defaults(store.state.guilds[guildId]),
        guildName:guild.name,version:VERSION,audit:(store.state.audit||[]).filter(a=>a.guildId===guildId).slice(0,50),stats:stats(store.state,guildId),
        connected:true,uptimeSeconds:Math.floor(process.uptime())}};
    }catch(e){return {status:403,body:{error:e.message}};}
  },
  async update({guildId,adminId,patch}){
    try{
      const guild=await this.permission(guildId,adminId);
      const validated=validatePatch(patch);
      store.state.guilds[guildId]={...(store.state.guilds[guildId]||{}),...validated};
      recordAudit(store,{guildId,actorId:adminId,action:'dashboard_settings',details:Object.keys(validated).join(', ')});
      await store.persist();
      let panelUpdated=false;
      const config=store.state.guilds[guildId];
      if(config.panelMessageId&&config.panelChannelId){
        try{
          const channel=await guild.channels.fetch(config.panelChannelId);
          if(channel?.isTextBased()&&channel.messages){
            const message=await channel.messages.fetch(config.panelMessageId);
            const updated=await ui.publish(channel,decorate(verifyPanel(guild),'verify',message,guild.name),message);
            if(updated.id!==config.panelMessageId){config.panelMessageId=updated.id;await store.persist();}
            panelUpdated=true;
          }
        }catch(err){console.warn('Verify-Panel noch nicht aktualisiert:',err.message)}
      }
      return {status:200,body:{ok:true,guildId,config:defaults(config),version:VERSION,panelUpdated,notice:panelUpdated?'Live-Panel aktualisiert':'Einstellungen gespeichert. Verwende /verify-panel, um das Panel neu zu senden.'}};
    }catch(e){return {status:403,body:{error:e.message}};}
  }
};
async function adminView(guildId,userId,adminId){return userMessages({client,guildId,userId,adminId,limit:18});}
async function resolveGuildInvite(invite,adminId){
  const value=String(invite||'').trim();
  const match=value.match(/^(?:https?:\/\/)?(?:(?:www\.)?discord\.gg\/|(?:www\.)?discord(?:app)?\.com\/invite\/)?([a-zA-Z0-9-]{2,40})\/?$/);
  if(!match)throw Error('Ungültiger Discord-Einladungslink');
  const invitation=await client.fetchInvite(match[1]);
  const guild=client.guilds.cache.get(invitation.guild?.id);
  if(!guild)throw Error('Bot ist auf diesem Zielserver nicht vorhanden.');
  if(!store.state.guilds[guild.id]?.allowTransfer)throw Error('Der Zielserver hat Member-Transfers nicht erlaubt.');
  // For this website owner/admin, require authorized Discord administrator on destination server.
  await ops.permission(guild.id,adminId);
  return {guildId:guild.id,name:guild.name,invite:match[1]};
}
const bridge = makeBridge({ dir:env.dataDir, support:supportSuite, security, ownerAlerts, changelog:()=>updateHistory(env.dataDir), messages:adminView, resolveInvite:resolveGuildInvite, detail: memberDetails, snapshot:() => ({online:client.isReady(),version:VERSION,updateStatus:(()=>{try{return JSON.parse(require('node:fs').readFileSync(path.join(env.dataDir,'update-status.json'),'utf8'))}catch{return {enabled:process.env.NOVORA_AUTO_UPDATE!=='false'}}})(),uptimeSeconds:Math.floor(process.uptime()),stats:stats(store.state), botName:client.user?.username||'Novora Verify', clientId:env.clientId, guilds:[...client.guilds.cache.values()].slice(0,70).map(guildInfo), members:Object.values(store.state.members).slice(0,100).map(memberInfo)}), roleAdmin, ops, transfer:async (guildId,userIds)=> { const job=normalizeJob({id:'f'.repeat(32),guildId,userIds}); if (!job) throw new Error('Ungültige Transferanfrage'); const result=await executeJob({guildId,memberIds:userIds}); return resultsForWebsite(job,result); }});
startWebsite({ port: env.port, publicUrl: env.publicUrl, websiteUrl: env.website, client, oauth, store, bridge, verified: async (member, guildId) => {
  try { if(store.state.guilds[guildId]?.verificationPaused)throw Error('Verifizierung pausiert.');
    await grantRole(member,guildId);
    const guild=client.guilds.cache.get(guildId), config=store.state.guilds[guildId];
    if(guild&&config?.panelChannelId&&config?.panelMessageId){
      const channel=await guild.channels.fetch(config.panelChannelId).catch(()=>null);
      if(channel?.messages){
        const msg=await channel.messages.fetch(config.panelMessageId).catch(()=>null);
        if(msg)await ui.publish(channel,decorate(verifyPanel(guild),'verify',msg,guild.name),msg).then(async m=>{if(m.id!==config.panelMessageId){config.panelMessageId=m.id;await store.persist();}}).catch(err=>console.warn('Verify-Zähler konnte nicht aktualisiert werden:',err.message));
      }
    }
  }
  finally { void sync(); }
}});
setInterval(() => { void sync(); },env.syncMs).unref();
setInterval(() => { void checkJobs(); },20000).unref();
async function close() { if (shuttingDown) return; shuttingDown=true; voiceAudio.shutdown(); if(saveTimer)clearTimeout(saveTimer); await store.persist().catch(console.error); client.destroy(); process.exit(0); }
process.once('SIGTERM',()=>{void close();});
process.once('SIGINT',()=>{void close();});
client.once(Events.ClientReady,()=>{if(process.send)process.send({kind:'novora-ready'});});
client.login(env.token).catch(err => { console.error('Discord Login fehlgeschlagen:',err.message); process.exit(1); });
