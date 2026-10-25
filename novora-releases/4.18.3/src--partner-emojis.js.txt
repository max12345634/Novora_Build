'use strict';
const path=require('node:path');const fs=require('node:fs');
const embedded=require('./partner-art-v35');
const names=['nv_partner','nv_partner_edit','nv_partner_end','nv_partner_small','nv_partner_medium','nv_partner_large'];
async function uploadPartnershipEmojis(store){
  if(!/^\d{17,22}$/.test(process.env.DISCORD_CLIENT_ID||'')||!process.env.DISCORD_TOKEN)throw Error('Discord-Bot Zugangsdaten fehlen');
  const saved={...(store.state.appEmojis||{})};
  if(names.every(n=>saved[n])&&store.state.partnershipEmojiStyleVersion==='flat-v35')return saved;
  const url=`https://discord.com/api/v10/applications/${process.env.DISCORD_CLIENT_ID}/emojis`;
  const authorization={Authorization:'Bot '+process.env.DISCORD_TOKEN};
  const res=await fetch(url,{headers:authorization,signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('Application-Emojis nicht abrufbar: HTTP '+res.status);
  const json=await res.json();
  const existing=new Map((json.items||[]).map(x=>[x.name,String(x.id)]));
  for(const name of names){
    const remote=name+'_flat';
    if(existing.has(remote))saved[name]=existing.get(remote);
    else {
      const file=path.join(__dirname,'..','assets','emojis',name+'.png');
      const buffer=fs.existsSync(file)?fs.readFileSync(file):Buffer.from(embedded[name]||'','base64');
      if(!buffer.length)throw Error('Emoji-Datei fehlt: '+name);
      if(buffer.length>256*1024)throw Error('Emoji-Datei zu groß: '+name);
      const response=await fetch(url,{method:'POST',headers:{...authorization,'Content-Type':'application/json'},
        body:JSON.stringify({name:remote,image:'data:image/png;base64,'+buffer.toString('base64')}),signal:AbortSignal.timeout(15000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error('Emoji '+name+': Discord HTTP '+response.status+' '+String(result.message||''));
      saved[name]=String(result.id);
    }
    store.state.appEmojis={...saved};await store.persist();
  }
  store.state.partnershipEmojiStyleVersion='flat-v35';await store.persist();
  return saved;
}
module.exports={names,uploadPartnershipEmojis};
