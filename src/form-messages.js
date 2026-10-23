'use strict';
// Discord Components V2 imposes a combined text budget of 4,000 characters
// and a maximum of 10 children per container. Keep the original answers intact
// while splitting long forms across several private messages.
const ui=require('./ui-v2');
function batches(lines,{maxChars=3500,maxItems=8}={}){
 if(!Array.isArray(lines))throw Error('Ungültige Formularzeilen.');
 const result=[];let group=[],count=0;
 const flush=()=>{if(group.length){result.push(group);group=[];count=0;}};
 for(const input of lines){
  const str=String(input??'');
  for(let offset=0;offset<str.length||offset===0;offset+=maxChars){
   const section=str.slice(offset,offset+maxChars);
   if(count+section.length>maxChars||group.length>=maxItems)flush();
   group.push(section);count+=section.length;
   if(!str.length)break;
  }
 }
 flush();return result;
}
async function sendPrivateForm(channel,lines,{color=0x6170B3}={}){
 const parts=batches(lines);
 for(const [index,part] of parts.entries()){
  const values=index===0?part:['**Fortsetzung des Formulars ('+(index+1)+'/'+parts.length+')**',...part];
  await channel.send(ui.payload({color,lines:values}));
 }
 return parts.length;
}
module.exports={batches,sendPrivateForm};
