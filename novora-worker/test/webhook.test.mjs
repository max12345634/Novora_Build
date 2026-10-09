import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../src/index.mjs';

const guildID='123456789012345678',secret='whsec_local_test_only';
const env={GALAXYBOT_WEBHOOK_SECRET:secret,GALAXYBOT_GUILD_ID:guildID};
function make({guild=guildID,old=false,tamper=false}={}){
 const event='ticket.created',time=String(Math.floor(Date.now()/1000)-(old?301:0));
 const body=JSON.stringify({id:'evt_01',event,guildID:guild,occurredAt:'2026-10-09T18:00:00Z',data:{}});
 const digest=createHmac('sha256',secret).update(time+'.'+body).digest('hex');
 return new Request('https://example.workers.dev/webhook/galaxybot',{method:'POST',headers:{'Content-Type':'application/json','X-GalaxyBot-Timestamp':time,'X-GalaxyBot-Signature':'sha256='+digest,'X-GalaxyBot-Delivery':'dlv_01','X-GalaxyBot-Event':event},body:tamper?body+' ':body});
}
test('minimal health endpoint',async()=>assert.equal((await worker.fetch(new Request('https://example.workers.dev/health'),env)).status,200));
test('no public homepage',async()=>assert.equal((await worker.fetch(new Request('https://example.workers.dev/'),env)).status,404));
test('accept signed event',async()=>assert.equal((await worker.fetch(make(),env)).status,204));
test('reject tampering',async()=>assert.equal((await worker.fetch(make({tamper:true}),env)).status,401));
test('reject stale event',async()=>assert.equal((await worker.fetch(make({old:true}),env)).status,401));
test('reject cross-server event',async()=>assert.equal((await worker.fetch(make({guild:'999999999999999999'}),env)).status,403));
test('reject missing secrets',async()=>assert.equal((await worker.fetch(make(),{GALAXYBOT_GUILD_ID:guildID})).status,503));
