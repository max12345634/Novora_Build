/** Novora AI Core: read-only GalaxyBot webhook receiver. */
const allowed=new Set(['ticket.created','ticket.claimed','ticket.unclaimed','ticket.forwarded','ticket.priority_changed','ticket.closed','ticket.deleted','ticket.rated','support.created','support.claimed','support.transferred','support.closed','support.cancelled','support.deleted','support.rated','moderation.case_created','moderation.unban','moderation.unmute','moderation.unwarn','moderation.case_deleted']);
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex,nofollow'};
const respond=(status,data)=>new Response(data?JSON.stringify(data):null,{status,headers});
function hexBytes(s){if(!/^[0-9a-f]{64}$/.test(s))return null;return Uint8Array.from({length:32},(_,i)=>parseInt(s.slice(i*2,i*2+2),16));}
export async function verifyWebhook(req,secret,guildId,now=Math.floor(Date.now()/1000)){
 if(!secret?.startsWith('whsec_')||!/^\d{15,22}$/.test(guildId||''))return{status:503,reason:'not_configured'};
 const h=req.headers,t=h.get('x-galaxybot-timestamp'),s=h.get('x-galaxybot-signature'),d=h.get('x-galaxybot-delivery');
 if(!/^\d{10,}$/.test(t||'')||Math.abs(now-Number(t))>300||!s?.startsWith('sha256=')||!d||d.length>256)return{status:401,reason:'bad_headers'};
 const sig=hexBytes(s.slice(7));if(!sig)return{status:401,reason:'bad_signature'};
 if(!h.get('content-type')?.toLowerCase().startsWith('application/json'))return{status:415,reason:'json_required'};
 if(Number(h.get('content-length')||0)>65536)return{status:413,reason:'payload_too_large'};
 const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>65536)return{status:413,reason:'payload_too_large'};
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('HMAC',key,sig,new TextEncoder().encode(t+'.'+raw));
 if(!valid)return{status:401,reason:'bad_signature'};
 let p;try{p=JSON.parse(raw)}catch{return{status:400,reason:'invalid_json'}}
 if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.id!=='string'||!p.id||p.id.length>256||typeof p.guildID!=='string'||!/^\d{15,22}$/.test(p.guildID)||!allowed.has(p.event)||p.event!==h.get('x-galaxybot-event')||typeof p.occurredAt!=='string'||Number.isNaN(Date.parse(p.occurredAt))||!p.data||typeof p.data!=='object'||Array.isArray(p.data))return{status:400,reason:'invalid_event'};
 if(p.guildID!==guildId)return{status:403,reason:'wrong_server'};
 return{status:204,payload:p,delivery:d};
}
export default{async fetch(req,env){
 const path=new URL(req.url).pathname;
 if(path==='/health'&&req.method==='GET')return respond(200,{ok:true,service:'novora-ai-core',mode:'read-only'});
 if(path!=='/webhook/galaxybot'||req.method!=='POST')return respond(404,{error:'not_found'});
 try{const v=await verifyWebhook(req,env.GALAXYBOT_WEBHOOK_SECRET,env.GALAXYBOT_GUILD_ID);
  if(v.status!==204)return respond(v.status,{error:v.reason});
  // No AI, message storage, moderation, actions or persistence yet.
  console.info(JSON.stringify({kind:'galaxybot_event',event:v.payload.event,guildID:v.payload.guildID,delivery:v.delivery,sideEffects:false}));
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('webhook_error',e instanceof Error?e.message:'unknown');return respond(500,{error:'internal_error'});}
}};
