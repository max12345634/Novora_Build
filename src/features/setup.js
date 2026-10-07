const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder,
  ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../utils/guildSettings');
const { createPanelEmbed, createVerifyButton } = require('./verify');
const { sendTicketPanel } = require('./tickets');

const IDS={menu:'setup:menu',tc:'setup:tickets:channel',tr:'setup:tickets:role',tcat:'setup:tickets:category',tl:'setup:tickets:log',tf:'setup:tickets:finish',
vc:'setup:verify:channel',vr:'setup:verify:role',vf:'setup:verify:finish',wc:'setup:welcome:channel',lc:'setup:leave:channel',lf:'setup:lifecycle:finish',
logc:'setup:logs:channel',logp:'setup:logs:profile',logf:'setup:logs:finish',appc:'setup:apps:channel',appr:'setup:apps:role',appf:'setup:apps:finish',
brand:'setup:branding:modal'};
function menu(){return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(IDS.menu).setPlaceholder('System auswählen …').addOptions(
{label:'Tickets',value:'tickets',emoji:'🎫',description:'Support-Tickets einrichten'},{label:'Verify',value:'verify',emoji:'✅',description:'Verifizierung einrichten'},
{label:'Welcome / Leave',value:'welcome',emoji:'👋',description:'Mitgliedsnachrichten einrichten'},{label:'Logs',value:'logs',emoji:'📋',description:'Logging einrichten'},
{label:'Bewerbungen',value:'applications',emoji:'📝',description:'Bewerbungen einrichten'},{label:'Branding',value:'branding',emoji:'🎨',description:'Bot-Profil anpassen'}));}
function baseEmbed(g){return new EmbedBuilder().setColor(0x5865f2).setTitle('⚙️ Novora Setup').setDescription('Richte Novora zentral ein. Wähle unten ein System.')
.addFields({name:'🎫 Tickets',value:'Support mit Kategorien, Case-ID, Übernahme und Logs.'},{name:'✅ Verify',value:'Captcha und Mitgliedsrolle.',inline:true},
{name:'👋 Welcome / Leave',value:'Begrüßung und Abschied.',inline:true},{name:'📋 Logs',value:'Basis, Erweitert oder Alles.',inline:true},
{name:'📝 Bewerbungen',value:'Bewerbungs-Panel und Teamrolle.',inline:true},{name:'🎨 Branding',value:'Server-spezifischer Name und Bio.',inline:true}).setFooter({text:g.name+' · Novora Build'});}
function done(title,text){return {embeds:[new EmbedBuilder().setColor(0x57f287).setTitle('✅ '+title).setDescription(text).setFooter({text:'Novora Build'})],components:[menu()]};}
function ticketWizard(c={}){const s=['Panel: '+(c.panelChannelId?'<#'+c.panelChannelId+'>':'❌ fehlt'),'Supportrolle: '+(c.teamRoleId?'<@&'+c.teamRoleId+'>':'❌ fehlt'),'Kategorie: '+(c.categoryId?'<#'+c.categoryId+'>':'keine'),'Logs: '+(c.logChannelId?'<#'+c.logChannelId+'>':'keiner')].join('\n');return{embeds:[new EmbedBuilder().setColor(0xf0b232).setTitle('🎫 Ticket-System').setDescription(s)],components:[
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.tc).setPlaceholder('Panel-Kanal').addChannelTypes(ChannelType.GuildText)),
new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(IDS.tr).setPlaceholder('Supportrolle')),
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.tcat).setPlaceholder('Ticket-Kategorie (optional)').addChannelTypes(ChannelType.GuildCategory).setMinValues(0)),
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.tl).setPlaceholder('Logkanal (optional)').addChannelTypes(ChannelType.GuildText).setMinValues(0)),
new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(IDS.tf).setLabel('Aktivieren').setEmoji('✅').setStyle(ButtonStyle.Success))]};}
function verifyWizard(c={}){return{embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('✅ Verify einrichten').setDescription('Panel: '+(c.channelId?'<#'+c.channelId+'>':'❌ fehlt')+'\nRolle: '+(c.roleId?'<@&'+c.roleId+'>':'❌ fehlt'))],components:[
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.vc).setPlaceholder('Verify-Kanal').addChannelTypes(ChannelType.GuildText)),
new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(IDS.vr).setPlaceholder('Rolle nach Verify')),
new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(IDS.vf).setLabel('Verify aktivieren').setEmoji('✅').setStyle(ButtonStyle.Success))]};}
function lifecycleWizard(c={}){return{embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('👋 Welcome / Leave').setDescription('Welcome: '+(c.welcome?.channelId?'<#'+c.welcome.channelId+'>':'aus')+'\nLeave: '+(c.leave?.channelId?'<#'+c.leave.channelId+'>':'aus'))],components:[
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.wc).setPlaceholder('Welcome-Kanal (optional)').addChannelTypes(ChannelType.GuildText).setMinValues(0)),
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.lc).setPlaceholder('Leave-Kanal (optional)').addChannelTypes(ChannelType.GuildText).setMinValues(0)),
new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(IDS.lf).setLabel('Speichern').setEmoji('✅').setStyle(ButtonStyle.Success))]};}
function logWizard(c={}){return{embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('📋 Logging').setDescription('Kanal: '+(c.channelId?'<#'+c.channelId+'>':'❌ fehlt')+'\nProfil: **'+(c.profile||'basis')+'**')],components:[
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.logc).setPlaceholder('Logkanal').addChannelTypes(ChannelType.GuildText)),
new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(IDS.logp).setPlaceholder('Log-Profil').addOptions({label:'Basis',value:'basis'},{label:'Erweitert',value:'erweitert'},{label:'Alles',value:'alles'})),
new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(IDS.logf).setLabel('Logging aktivieren').setEmoji('✅').setStyle(ButtonStyle.Success))]};}
function appWizard(c={}){return{embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('📝 Bewerbungen').setDescription('Panel: '+(c.channelId?'<#'+c.channelId+'>':'❌ fehlt')+'\nTeamrolle: '+(c.teamRoleId?'<@&'+c.teamRoleId+'>':'❌ fehlt'))],components:[
new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.appc).setPlaceholder('Bewerbungs-Kanal').addChannelTypes(ChannelType.GuildText)),
new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(IDS.appr).setPlaceholder('Bewerbungs-Teamrolle')),
new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(IDS.appf).setLabel('Panel erstellen').setEmoji('✅').setStyle(ButtonStyle.Success))]};}
function brandModal(){return new ModalBuilder().setCustomId(IDS.brand).setTitle('Novora Branding').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Server-spezifischer Bot-Name').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(32)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bio').setLabel('Bio').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(190)));}
async function patch(i,key,val){const s=await getGuildSettings(i.guildId);const n={...(s[key]||{}),...val};await updateGuildSettings(i.guildId,{[key]:n});return n;}
async function handleSetupInteraction(i){
if(!i.inGuild()||!i.customId?.startsWith('setup:'))return false;
if(!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){await i.reply({content:'Du brauchst **Server verwalten**.',ephemeral:true});return true;}
if(i.isStringSelectMenu()&&i.customId===IDS.menu){const s=await getGuildSettings(i.guildId),v=i.values[0];if(v==='tickets')return i.update(ticketWizard(s.tickets||{})).then(()=>true);if(v==='verify')return i.update(verifyWizard(s.verify||{})).then(()=>true);if(v==='welcome')return i.update(lifecycleWizard(s)).then(()=>true);if(v==='logs')return i.update(logWizard(s.logs||{})).then(()=>true);if(v==='applications')return i.update(appWizard(s.applications||{})).then(()=>true);if(v==='branding'){await i.showModal(brandModal());return true;}}
if(i.isChannelSelectMenu()&&i.customId===IDS.tc){const n=await patch(i,'tickets',{panelChannelId:i.values[0]});await i.update(ticketWizard(n));return true;}
if(i.isRoleSelectMenu()&&i.customId===IDS.tr){const n=await patch(i,'tickets',{teamRoleId:i.values[0]});await i.update(ticketWizard(n));return true;}
if(i.isChannelSelectMenu()&&i.customId===IDS.tcat){const n=await patch(i,'tickets',{categoryId:i.values[0]||null});await i.update(ticketWizard(n));return true;}
if(i.isChannelSelectMenu()&&i.customId===IDS.tl){const n=await patch(i,'tickets',{logChannelId:i.values[0]||null});await i.update(ticketWizard(n));return true;}
if(i.isButton()&&i.customId===IDS.tf){const s=await getGuildSettings(i.guildId),c=s.tickets||{};if(!c.panelChannelId||!c.teamRoleId){await i.reply({content:'Panel-Kanal und Supportrolle fehlen.',ephemeral:true});return true;}const ch=await i.guild.channels.fetch(c.panelChannelId).catch(()=>null);if(!ch?.isTextBased()){await i.reply({content:'Panel-Kanal ist ungültig.',ephemeral:true});return true;}await updateGuildSettings(i.guildId,{tickets:{...c,enabled:true}});await sendTicketPanel(ch,i.guild);await i.update(done('Ticket-System aktiv','Panel: '+ch));return true;}
if(i.isChannelSelectMenu()&&i.customId===IDS.vc){const n=await patch(i,'verify',{channelId:i.values[0]});await i.update(verifyWizard(n));return true;}
if(i.isRoleSelectMenu()&&i.customId===IDS.vr){const n=await patch(i,'verify',{roleId:i.values[0]});await i.update(verifyWizard(n));return true;}
if(i.isButton()&&i.customId===IDS.vf){const s=await getGuildSettings(i.guildId),c=s.verify||{};if(!c.channelId||!c.roleId){await i.reply({content:'Verify-Kanal und Rolle fehlen.',ephemeral:true});return true;}const ch=await i.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased()){await i.reply({content:'Verify-Kanal ungültig.',ephemeral:true});return true;}const v={...c,enabled:true,title:'Server Verifizierung',description:'Bitte verifiziere dich mit dem Button, um Zugriff auf den Server zu erhalten.',footerText:i.guild.name,color:0x5865f2};await updateGuildSettings(i.guildId,{verify:v});await ch.send({embeds:[createPanelEmbed(i.guild,v)],components:[createVerifyButton()]});await i.update(done('Verify aktiv','Panel: '+ch));return true;}
if(i.isChannelSelectMenu()&&i.customId===IDS.wc){const id=i.values[0]||null;await patch(i,'welcome',{enabled:Boolean(id),channelId:id,title:'Willkommen bei %SERVERNAME%',description:'Hey %MENTION%, schön, dass du da bist! Du bist Mitglied Nummer %TOTALUSERCOUNT%.',footerText:i.guild.name,color:0x5865f2});const s=await getGuildSettings(i.guildId);await i.update(lifecycleWizard(s));return true;}
if(i.isChannelSelectMenu()&&i.customId===IDS.lc){const id=i.values[0]||null;await patch(i,'leave',{enabled:Boolean(id),channelId:id,title:'Auf Wiedersehen',description:'%USERNAME% hat den Server verlassen.',footerText:i.guild.name,color:0x5865f2});const s=await getGuildSettings(i.guildId);await i.update(lifecycleWizard(s));return true;}
if(i.isButton()&&i.customId===IDS.lf){await i.update(done('Welcome / Leave gespeichert','Die ausgewählten Kanäle sind aktiv.'));return true;}
if(i.isChannelSelectMenu()&&i.customId===IDS.logc){const n=await patch(i,'logs',{channelId:i.values[0]});await i.update(logWizard(n));return true;}
if(i.isStringSelectMenu()&&i.customId===IDS.logp){const n=await patch(i,'logs',{profile:i.values[0]});await i.update(logWizard(n));return true;}
if(i.isButton()&&i.customId===IDS.logf){const s=await getGuildSettings(i.guildId),c=s.logs||{};if(!c.channelId){await i.reply({content:'Wähle zuerst einen Logkanal.',ephemeral:true});return true;}await updateGuildSettings(i.guildId,{logs:{...c,enabled:true,profile:c.profile||'basis'}});await i.update(done('Logging aktiv','Profil **'+(c.profile||'basis')+'** wurde aktiviert.'));return true;}
if(i.isChannelSelectMenu()&&i.customId===IDS.appc){const n=await patch(i,'applications',{channelId:i.values[0]});await i.update(appWizard(n));return true;}
if(i.isRoleSelectMenu()&&i.customId===IDS.appr){const n=await patch(i,'applications',{teamRoleId:i.values[0]});await i.update(appWizard(n));return true;}
if(i.isButton()&&i.customId===IDS.appf){const s=await getGuildSettings(i.guildId),c=s.applications||{};if(!c.channelId||!c.teamRoleId){await i.reply({content:'Kanal und Teamrolle fehlen.',ephemeral:true});return true;}const ch=await i.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased()){await i.reply({content:'Bewerbungs-Kanal ungültig.',ephemeral:true});return true;}await updateGuildSettings(i.guildId,{applications:{...c,enabled:true}});await ch.send({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('📝 Werde Teil unseres Teams').setDescription('Du möchtest Teil unseres Teams werden? Starte unten deine Bewerbung.').setFooter({text:i.guild.name+' · Bewerbungen'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('application:open').setLabel('Bewerbung starten').setEmoji('📝').setStyle(ButtonStyle.Primary))]});await i.update(done('Bewerbungen aktiv','Panel: '+ch));return true;}
if(i.isModalSubmit()&&i.customId===IDS.brand){const name=i.fields.getTextInputValue('name'),bio=i.fields.getTextInputValue('bio');if(!name&&!bio){await i.reply({content:'Gib mindestens Name oder Bio an.',ephemeral:true});return true;}const body={};if(name)body.nick=name;if(bio)body.bio=bio;await i.client.rest.patch('/guilds/'+i.guildId+'/members/@me',{body});await i.reply({content:'✅ Branding wurde für diesen Server gespeichert.',ephemeral:true});return true;}
return false;}
module.exports={baseEmbed,setupMenu:menu,handleSetupInteraction,ticketWizard};
