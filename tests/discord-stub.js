'use strict';
// Only used in offline local unit tests; never bundled in runtime deployment.
class Base {constructor(){this.data={};}setName(v){this.data.name=v;return this;}setDescription(v){this.data.description=v;return this;}
 setDefaultMemberPermissions(v){this.data.default_member_permissions=String(v);return this;}
 setChannelTypes(...v){this.data.channel_types=v;return this;}setMinValues(v){this.data.min_values=v;return this;}setMaxValues(v){this.data.max_values=v;return this;}
 setImage(v){this.data.image={url:v};return this;}setEmoji(v){this.data.emoji=v;return this;}setDisabled(v){this.data.disabled=v;return this;}
 setTitle(v){this.data.title=v;return this;}setColor(v){this.data.color=v;return this;}setAuthor(v){this.data.author=v;return this;}
 setFooter(v){this.data.footer=v;return this;}setTimestamp(v){this.data.timestamp=v;return this;}
 addFields(...x){this.data.fields??=[];this.data.fields.push(...x);return this;}
 setCustomId(v){this.data.custom_id=v;return this;}setLabel(v){this.data.label=v;return this;}setURL(v){this.data.url=v;return this;}setRequired(v){this.data.required=v;return this;}
 setStyle(v){this.data.style=v;return this;}setMaxLength(v){this.data.max_length=v;return this;}setMinLength(v){this.data.min_length=v;return this;}
 setPlaceholder(v){this.data.placeholder=v;return this;}setValue(v){this.data.value=v;return this;}
 addChannelTypes(...v){this.data.channel_types=v;return this;}
 addChoices(...v){this.data.choices=v;return this;}
 addOptions(...v){this.options??=[];this.options.push(...v);return this;}
 addSubcommand(fn){let c=new Base();fn(c);this.options??=[];this.options.push({...c.toJSON(),type:1});return this;}
 addChannelOption(fn){return this._addOpt(fn,7);}addRoleOption(fn){return this._addOpt(fn,8);}addStringOption(fn){return this._addOpt(fn,3);}
 _addOpt(fn,type){let c=new Base();fn(c);this.options??=[];this.options.push({...c.toJSON(),type});return this;}
 toJSON(){return {...this.data, ...(this.options?{options:this.options}:{}),...(this.components?{components:this.components}: {})};}}
class Row {constructor(){this.components=[]}addComponents(...values){this.components.push(...values);return this}}
class Select extends Base {constructor(){super();this.options=[]}}
class Attachment {constructor(file,{name}={}){this.file=file;this.name=name||'';}}
class Embed extends Base {constructor(){super();this.data.fields=[];}}
class Modal extends Base {constructor(){super();this.components=[]}addComponents(...rows){this.components.push(...rows);return this;}}
module.exports={SlashCommandBuilder:Base,ChannelSelectMenuBuilder:Select,RoleSelectMenuBuilder:Select,AttachmentBuilder:Attachment,ChannelType:{GuildText:0,GuildVoice:2,GuildCategory:4,GuildForum:15},
 PermissionFlagsBits:{Administrator:8n,ManageChannels:16n,ManageRoles:1n<<28n,ViewChannel:1024n,SendMessages:2048n,EmbedLinks:16384n,Connect:1n<<20n,MoveMembers:1n<<24n,ReadMessageHistory:1n<<16n},
 MessageFlags:{Ephemeral:64},EmbedBuilder:Embed,ActionRowBuilder:Row,StringSelectMenuBuilder:Select,ButtonBuilder:Base,ButtonStyle:{Primary:1,Secondary:2,Success:3,Danger:4},ModalBuilder:Modal,TextInputBuilder:Base,TextInputStyle:{Short:1,Paragraph:2}};
