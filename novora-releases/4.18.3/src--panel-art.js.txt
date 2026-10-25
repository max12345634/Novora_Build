'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {AttachmentBuilder}=require('discord.js');
const ui=require('./ui-v2');
const KINDS=new Set(['partnerschaft','tickets','verify','voice','applications','factions']);
function serverTitle(name){return String(name||'Community').replace(/<a?:[\w-]+:\d+>/g,'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').replace(/[\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,70)||'Community';}
function render(kind){
 if(!KINDS.has(kind))throw Error('Unbekannter Paneltyp');
 return fs.readFileSync(path.join(__dirname,'..','assets','banners',`novora-panel-${kind}.png`));
}
function decorate(payload,kind,existing){
 const name=`novora-panel-${kind}.png`;
 // V2 gallery lives in the container. Existing attachments are replaced safely.
 if((payload.flags&ui.FLAG)===ui.FLAG){
   const components=payload.components||[];
   if(!components.some(c=>JSON.stringify(c).includes('attachment://'+name))){
     const first=components.find(c=>c.type===17);
     if(first)first.components.push(ui.separator(),ui.gallery(name));
   }
 } else if(payload.embeds?.[0])payload.embeds[0].setImage('attachment://'+name);
 else throw Error('Panel enthält keine gültige Komponente');
 if(existing?.attachments?.size)payload.attachments=[];
 payload.files=[new AttachmentBuilder(render(kind),{name})];
 return payload;
}
module.exports={decorate,render,serverTitle};
