const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder,
  PermissionFlagsBits, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { getGuildSettings } = require('../utils/guildSettings');
const { sendLog } = require('../utils/auditLog');
const TOPIC='novora-application:';
function modal(){return new ModalBuilder().setCustomId('application:form').setTitle('Team-Bewerbung').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Wie alt bist du?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('experience').setLabel('Welche Erfahrungen hast du?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('why').setLabel('Warum möchtest du ins Team?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('time').setLabel('Wie viel Zeit hast du?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('more').setLabel('Sonst noch etwas?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)));}
function staff(i,c){return i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)||Boolean(i.member?.roles?.cache?.has(c.teamRoleId));}
async function handleApplicationInteraction(i){
if(!i.inGuild()||!i.customId?.startsWith('application:'))return false;
const c=(await getGuildSettings(i.guildId)).applications||{};
if(!c.enabled){await i.reply({content:'Das Bewerbungs-System ist nicht aktiv.',ephemeral:true});return true;}
if(i.isButton()&&i.customId==='application:open'){await i.showModal(modal());return true;}
if(i.isModalSubmit()&&i.customId==='application:form'){await i.deferReply({ephemeral:true});const old=i.guild.channels.cache.find(x=>x.topic===TOPIC+i.user.id);if(old){await i.editReply({content:'Du hast bereits eine offene Bewerbung: '+old});return true;}const ch=await i.guild.channels.create({name:'bewerbung-'+i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,50),type:ChannelType.GuildText,topic:TOPIC+i.user.id,permissionOverwrites:[
{id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
{id:i.client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]},
{id:c.teamRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}]});
const vals=[['Alter',i.fields.getTextInputValue('age')],['Erfahrung',i.fields.getTextInputValue('experience')],['Motivation',i.fields.getTextInputValue('why')],['Zeit',i.fields.getTextInputValue('time')],['Weitere Infos',i.fields.getTextInputValue('more')||'Keine']];
await ch.send({content:'<@'+i.user.id+'> <@&'+c.teamRoleId+'>',embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('📝 Neue Bewerbung').setDescription('Bewerbung von <@'+i.user.id+'>').addFields(...vals.map(([name,value])=>({name,value:value.slice(0,1000)}))).setTimestamp()],components:[new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('application:accept').setLabel('Annehmen').setEmoji('✅').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('application:reject').setLabel('Ablehnen').setEmoji('❌').setStyle(ButtonStyle.Danger))],allowedMentions:{users:[i.user.id],roles:[c.teamRoleId]}});
await i.editReply({content:'✅ Deine Bewerbung wurde erstellt: '+ch});await sendLog(i.guild,'Bewerbung erstellt','Kanal: <#'+ch.id+'> · Person: <@'+i.user.id+'>');return true;}
if(i.isButton()&&['application:accept','application:reject'].includes(i.customId)){if(!staff(i,c)){await i.reply({content:'Nur das Bewerbungs-Team kann entscheiden.',ephemeral:true});return true;}const accepted=i.customId.endsWith('accept');await i.message.edit({components:[]});await i.reply({embeds:[new EmbedBuilder().setColor(accepted?0x57f287:0xed4245).setTitle(accepted?'✅ Bewerbung angenommen':'❌ Bewerbung abgelehnt').setDescription('Entscheidung von <@'+i.user.id+'>.')]});await sendLog(i.guild,accepted?'Bewerbung angenommen':'Bewerbung abgelehnt','Kanal: <#'+i.channelId+'> · Bearbeiter: <@'+i.user.id+'>');return true;}
return false;}
module.exports={handleApplicationInteraction,modal};
