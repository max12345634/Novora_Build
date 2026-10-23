'use strict';
// Lightweight contract double for offline CI only. Never shipped as runtime dependency.
const Module=require('node:module');
class Builder{
  constructor(){this.data={};this.components=[];this.options=[];}
  setName(v){this.name=v;this.data.name=v;return this}
  setDescription(v){this.data.description=v;return this}
  setTitle(v){this.data.title=v;return this}
  setColor(v){this.data.color=v;return this}
  setAuthor(v){this.data.author=v;return this}
  setFooter(v){this.data.footer=v;return this}
  setThumbnail(v){this.data.thumbnail=v;return this}
  setImage(v){this.data.image=v;return this}
  setLabel(v){this.data.label=v;return this}
  setCustomId(v){this.data.custom_id=v;return this}
  setStyle(v){this.data.style=v;return this}
  setRequired(v){this.data.required=v;return this}
  setMinLength(v){this.data.min_length=v;return this}
  setMaxLength(v){this.data.max_length=v;return this}
  setPlaceholder(v){this.data.placeholder=v;return this}
  setURL(v){this.data.url=v;return this}
  setDisabled(v){this.data.disabled=v;return this}
  setEmoji(v){this.data.emoji=v;return this}
  setTimestamp(v){this.data.timestamp=v;return this}
  addFields(...v){this.data.fields=(this.data.fields||[]).concat(v);return this}
  addOptions(...v){this.options.push(...v);return this}
  addChoices(...v){this.data.choices=(this.data.choices||[]).concat(v);return this}
  addComponents(...v){this.components.push(...v);return this}
  addSubcommand(fn){const sub=new Builder;fn(sub);this.options.push(sub.toJSON());return this}
  addChannelOption(fn){const sub=new Builder;fn(sub);this.options.push(sub.toJSON());return this}
  addRoleOption(fn){return this.addChannelOption(fn)}
  addStringOption(fn){return this.addChannelOption(fn)}
  addBooleanOption(fn){return this.addChannelOption(fn)}
  setChannelTypes(...v){this.data.channel_types=v;return this}
  toJSON(){return {...this.data,options:this.options};}
  toString(){return JSON.stringify(this.toJSON())}
}
const channel={GuildText:0,GuildVoice:2,GuildCategory:4,GuildForum:15};
const permissionNames=['Administrator','ViewChannel','ReadMessageHistory','SendMessages','ManageChannels','MoveMembers','Connect','EmbedLinks','ManageRoles','ManageGuildExpressions','CreateGuildExpressions'];
const PermissionFlagsBits=Object.fromEntries(permissionNames.map((x,i)=>[x,2n**BigInt(i)]));
const discord={ChannelType:channel,PermissionFlagsBits,MessageFlags:{Ephemeral:64},ButtonStyle:{Primary:1,Secondary:2},TextInputStyle:{Short:1,Paragraph:2},
  SlashCommandBuilder:Builder,EmbedBuilder:Builder,ActionRowBuilder:Builder,StringSelectMenuBuilder:Builder,ButtonBuilder:Builder,ModalBuilder:Builder,TextInputBuilder:Builder,AttachmentBuilder:Builder};
function activate(){const old=Module._load;Module._load=function(request,parent,isMain){if(request==='discord.js')return discord;return old.apply(this,arguments)};return discord}
module.exports={activate,discord};
