'use strict';
// Discord Components V2. Payloads must not contain content/embeds/stickers.
const {MessageFlags,AttachmentBuilder}=require('discord.js');
const fs=require('node:fs'); const path=require('node:path');
const FLAG=MessageFlags?.IsComponentsV2||32768;
const {isV2Message}=require('./message-flags');
const safe=(value,max=1900)=>String(value??'').replace(/@everyone|@here/gi,'[Erwähnung]').replace(/[\x00-\x08\x0b-\x1f]/g,'').slice(0,max);
const title=(s)=>safe(s,150).replace(/(?<!\\)([#])/g,'\\$1');
function text(value){return {type:10,content:safe(value,3900)};}
function separator(){return {type:14,divider:true,spacing:1};}
function gallery(name){return {type:12,items:[{media:{url:'attachment://'+name},description:'Novora Panelgrafik'}]};}
function row(buttons){return {type:1,components:buttons.map(c=>typeof c.toJSON==='function'?c.toJSON():c)};}
function container({color=0x5865F2,lines=[],banner=null,rows=[],after=[]}={}){
  const c={type:17,accent_color:color,components:[]};
  for(const line of lines) if(line)c.components.push(text(line));
  if(banner){c.components.push(separator());c.components.push(gallery(banner));}
  for(const r of rows)if(r?.length)c.components.push(row(r));
  if(after.length && !banner)c.components.push(separator());
  for(const item of after){if(item===null)c.components.push(separator());else if(item)c.components.push(text(item));}
  return c;
}
function payload({color,lines,banner,rows,after,allowedMentions}={}){
  return {flags:FLAG,components:[container({color,lines,banner,rows,after})],allowedMentions:allowedMentions||{parse:[]}};
}
function addBannerFiles(p,kind,existing){
  const filename='novora-panel-'+kind+'.png';
  const image=path.join(__dirname,'..','assets','banners',filename);
  if(!fs.existsSync(image))throw Error('Banner fehlt: '+filename);
  if(existing?.attachments?.size)p.attachments=[];
  p.files=[new AttachmentBuilder(image,{name:filename})];
  return p;
}
// Convert a legacy embed panel to V2 without leaving duplicate active panels.
// Older Discord messages cannot always be converted in-place when embeds persist.
async function publish(channel,payload,existing){
  if(!existing)return channel.send(payload);
  const legacy=!isV2Message(existing)||Boolean(existing.embeds?.length);
  if(!legacy){
    // Never create an additional public panel because of a transient permissions,
    // upload or rate-limit problem: retain the known ID and report the error.
    return existing.edit(payload);
  }
  const next=await channel.send(payload);
  if(!next?.id){
    try{await next?.delete?.();}
    catch(rollback){console.error('Panel ohne Nachrichten-ID konnte nicht entfernt werden:',rollback);}
    throw new Error('Neue Panel-Nachricht hat keine ID. Altes Panel bleibt erhalten; Kanal manuell prüfen.');
  }
  try{await existing.delete();}
  catch(e){
    let removed=false;
    try{await next.delete();removed=true;}
    catch(rollback){console.error('Panel-Rollback fehlgeschlagen:',rollback);}
    throw new Error(removed
      ?'Altes Panel konnte nicht entfernt werden. Ersatzpanel zurückgenommen: '+e.message
      :'Altes Panel konnte nicht entfernt werden und Ersatzpanel konnte nicht zurückgenommen werden. Bitte Doppelung manuell prüfen: '+e.message);
  }
  return next;
}
function customEmoji(icons,key,alt=''){
  const id=icons?.[key];return id?`<:${key}_flat:${id}>`:alt;
}
function categoryRow(select){return row([select]);}
module.exports={FLAG,isV2Message,text,separator,gallery,row,container,payload,addBannerFiles,customEmoji,categoryRow,publish};
