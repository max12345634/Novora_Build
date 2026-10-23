'use strict';
// Explicit administrator opt-in to a server-specific bot profile. Never change global identity.
const {PermissionsBitField}=require('discord.js');
async function applyBranding(guild,enabled){
  if(!enabled)return {changed:false};
  const me=await guild.members.fetchMe();
  const nick=(guild.name+' • Verify').slice(0,32);
  // Nickname and avatar belong to the bot account within this guild, not to another user.
  await me.setNickname(nick,'Novora Verify: freigegebenes Server-Branding');
  let avatar=false;
  if(guild.iconURL({extension:'png',size:256})){
    try{
      const response=await fetch(guild.iconURL({extension:'png',size:256}),{signal:AbortSignal.timeout(8000)});
      const contentType=response.headers.get('content-type')||'';
      if(!response.ok||!contentType.startsWith('image/'))throw Error('Kein gültiges Bild');
      const buf=Buffer.from(await response.arrayBuffer());
      if(buf.length>0&&buf.length<500_000){
        const res=await fetch('https://discord.com/api/v10/guilds/'+guild.id+'/members/@me',{
          method:'PATCH',headers:{Authorization:'Bot '+process.env.DISCORD_TOKEN,'Content-Type':'application/json'},
          body:JSON.stringify({avatar:'data:image/png;base64,'+buf.toString('base64')}),signal:AbortSignal.timeout(12000)
        });
        if(res.ok)avatar=true;
      }
    }catch(e){ console.warn('Serveravatar nicht übernommen:',e.message); }
  }
  return {changed:true,nickname:nick,avatar};
}
module.exports={applyBranding};
