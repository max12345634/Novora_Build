'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Module=require('node:module'),load=Module._load;
Module._load=function(mod,...args){if(mod==='discord.js')return require('./discord-stub');return load.call(this,mod,...args)};
const {makeCommunitySuite,TEAM_STEPS,TYPES,header}=require('../src/community-suite');
const {fieldsFor}=require('../src/support-questions');
const {makeSupportSuite,ticketView}=require('../src/support-suite');
const {makePartnerships}=require('../src/partnerships');
Module._load=load;
const {archiveTicket,retainAttachments,trustedAttachmentURL}=require('../src/ticket-archive');
const gid='111111111111111111',userId='222222222222222222',botId='333333333333333333',staffId='444444444444444444';
test('staff-only application DM from private start button through all questions: resumes after restart and creates exactly one private ticket',async()=>{
 const sent=[],dmSent=[],published=[],db={communitySettings:{[gid]:{application:{panelId:'panel',categoryId:'cat',teamRoleId:staffId}}},communityCases:{}};
 const store={state:db,persist:async()=>{published.push(JSON.stringify(db.applicationSessions||{}));}};
 const candidate={id:userId,username:'Bewerber',send:async p=>{dmSent.push(p);}};
 const channel={id:'555555555555555555',send:async p=>{sent.push(p);return{id:'666666666666666666'}},delete:async()=>{throw Error('unexpected cleanup')}};
 const settings=[];
 const guild={id:gid,name:'Berlin RP',ownerId:'owner',members:{fetch:async id=>id===userId?{id}:null},channels:{create:async options=>{settings.push(options);return channel;}}};
 const client={user:{id:botId},guilds:{fetch:async id=>id===gid?guild:null}};
 let suite=makeCommunitySuite({client,store});
 assert.deepEqual(Object.keys(TYPES),['staff']);
 assert.equal(header(guild,'application',store).components[0].components.at(-1).components[0].options.length,1);
 const i={customId:`nvc:choose:application:${gid}`,guildId:gid,guild,user:candidate,message:{edit:async()=>{}},values:['staff'],inGuild:()=>true,isStringSelectMenu:()=>true,reply:async p=>{sent.push(p)}};
 assert.equal(await suite.onInteraction(i),true);
 assert.match(JSON.stringify(dmSent[0]),/Bewerbung starten/);
 const starter={customId:`nvapp:begin:${gid}`,user:candidate,update:async p=>{sent.push(p)}};
 assert.equal(await suite.onInteraction(starter),true);
 assert.match(JSON.stringify(dmSent.at(-1)),/Frage 1/);
 const dmChannel={send:async p=>{dmSent.push(p)}};
 let msg={guildId:null,author:candidate,channel:dmChannel,content:'Spielername'};
 assert.equal(await suite.onDMMessage(msg),true);
 assert.equal(db.applicationSessions[userId].step,1);
 suite=makeCommunitySuite({client,store}); // simulated process reload; same data state
 for(const answer of ['Ich helfe gern','Zwei Jahre Erfahrung','Ich stoppe den Streit','Drei Tage pro Woche']){
  msg={...msg,content:answer};assert.equal(await suite.onDMMessage(msg),true);
 }
 assert.equal(Object.keys(db.communityCases).length,1);
 assert.equal(db.applicationSessions[userId],undefined);
 assert.equal(settings.length,1);
 const c=Object.values(db.communityCases)[0];assert.equal(c.type,'staff');assert.equal(c.answers.profile,'Spielername');
 assert.equal(c.answers.availability,'Drei Tage pro Woche');
 assert.ok(settings[0].permissionOverwrites.some(x=>x.id===gid&&x.deny));
 assert.ok(settings[0].permissionOverwrites.some(x=>x.id===userId));
 assert.equal(await suite.onDMMessage({...msg,content:'Weiter'}),false);
});
test('DM application can be cancelled, no ticket opened; users cannot choose unsupported types',async()=>{
 const db={communitySettings:{[gid]:{application:{teamRoleId:staffId}}},communityCases:{}};
 const send=[];const user={id:userId,send:async p=>send.push(p)};
 const guild={id:gid,members:{fetch:async()=>({id:userId})}};
 const suite=makeCommunitySuite({client:{guilds:{fetch:async()=>guild}},store:{state:db,persist:async()=>{}}});
 let response;
 await suite.onInteraction({customId:`nvapp:begin:${gid}`,user,update:async()=>{}});
 const result=await suite.onDMMessage({guildId:null,author:user,content:'abbrechen',channel:{send:async p=>{response=p;}}});
 assert.equal(result,true);assert.match(response,/abgebrochen/i);
 assert.equal(db.applicationSessions[userId],undefined);
 assert.equal(Object.keys(db.communityCases).length,0);
});
test('short ticket questions and private upload buttons exist in support and partnerships',()=>{
 for(const type of ['question','rules','player','technical','report'])assert.equal(fieldsFor(type).length,2);
 const ticket=ticketView({id:'77777777-aaaa-4bbb-cccc-888888888888',status:'open',kind:'technical',userId,createdAt:Date.now()}, {},'Berlin RP');
 assert.match(JSON.stringify(ticket),/nvs:tevidence/);
 assert.match(fs.readFileSync(path.join(__dirname,'../src/partnerships.js'),'utf8'),/nvp:evidence/);
});
test('attachment archive copies Discord CDN content into private data directory, not the public zip',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'novora-v44-attachments-'));
 try{
  const ticket={id:'11111111-aaaa-4bbb-cccc-dddddddddddd',channelId:'555555555555555555',userId,createdAt:1};
  const guild={id:gid,name:'Berlin RP'},store={state:{},dataDir:tmp,persist:async()=>{}};
  const mockedFetch=async()=>new Response(Buffer.from('FILE-CONTENT'),{status:200,headers:{'content-length':'12'}});
  const channel={id:ticket.channelId,messages:{fetch:async()=>new Map([['msg',{id:'555555555555555556',createdTimestamp:12345,author:{id:userId,username:'User'},content:'Screenshot siehe unten',attachments:new Map([['file',{name:'bild.png',url:'https://cdn.discordapp.com/attachments/1/2/bild.png'}]])}]])}};
  const result=await archiveTicket({store,channel,guild,ticket,kind:'ticket',actorId:staffId,fetchFn:mockedFetch});
  const record=JSON.parse(fs.readFileSync(result.file,'utf8'));
  assert.equal(record.items[0].attachments[0].localFile,'m0-a0');
  assert.equal(fs.readFileSync(path.join(tmp,'support-transcripts',gid,record.items[0].attachments[0].localGroup,'m0-a0'),'utf8'),'FILE-CONTENT');
  assert.ok((fs.statSync(result.file).mode&0o077)===0);
  assert.ok(trustedAttachmentURL('https://cdn.discordapp.com/attachments/a/b'));
  assert.equal(trustedAttachmentURL('https://example.com/evil'),null);
  assert.equal(trustedAttachmentURL('http://cdn.discordapp.com/evil'),null);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('failed attachment copy prevents a complete transcript index and reports failure without deleting channel',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'novora-v44-failed-'));
 try{
  const ticket={id:'11111111-aaaa-4bbb-cccc-eeeeeeeeeeee',channelId:'555555555555555555',userId,createdAt:1};
  const store={state:{},dataDir:tmp,persist:async()=>{}};
  const channel={id:ticket.channelId,messages:{fetch:async()=>new Map([['x',{id:'555555555555555556',author:{id:userId},content:'Test',attachments:new Map([['x',{name:'image',url:'https://cdn.discordapp.com/attachments/1/2/img.png'}]])}]])}};
  await assert.rejects(archiveTicket({store,channel,guild:{id:gid},ticket,fetchFn:async()=>{throw Error('Download offline')}}),/offline/);
  assert.equal(store.state.supportTranscriptIndex,undefined);
  assert.equal(ticket.transcriptToken,undefined);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('partner action-specific modals: application 4, change 4, cancellation 2; no invalid empty invite on change',()=>{
 const {buildModal,validateForm,partnerTicketView}=require('../src/partnerships');
 assert.equal(buildModal(gid,'apply').components.length,4);
 assert.equal(buildModal(gid,'change').components.length,4);
 assert.equal(buildModal(gid,'cancel').components.length,2);
 const record=validateForm('change',{server:'Berlin RP',invite:'',members:'',advert:'',extra:''});
 assert.equal(record.invite,'');
 assert.match(JSON.stringify(partnerTicketView({name:'Berlin RP'}, {id:'11111111-aaaa-4bbb-cccc-dddddddddddd',kind:'change',status:'open',form:{server:'Berlin RP'},requesterId:userId}, {state:{appEmojis:{}}})),/nvp:evidence/);
});
test('same ticket can be safely re-archived with image attachments and unique paths if previous deletion did not succeed',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'novora-v44-retry-'));
 try{
  const ticket={id:'11111111-aaaa-4bbb-cccc-ffffffffffff',channelId:'555555555555555555',userId,createdAt:1};
  const store={state:{},dataDir:tmp,persist:async()=>{}};
  const channel={id:ticket.channelId,messages:{fetch:async()=>new Map([['x',{id:'555555555555555556',author:{id:userId},content:'Beleg',attachments:new Map([['x',{name:'screenshot.png',url:'https://cdn.discordapp.com/attachments/1/2/ss.png'}]])}]])}};
  const fetchFn=async()=>new Response(Buffer.from('IMAGE'),{status:200});
  const one=await archiveTicket({store,channel,guild:{id:gid},ticket,fetchFn});
  const first=JSON.parse(fs.readFileSync(one.file,'utf8')).items[0].attachments[0].localGroup;
  const two=await archiveTicket({store,channel,guild:{id:gid},ticket,fetchFn});
  const second=JSON.parse(fs.readFileSync(two.file,'utf8')).items[0].attachments[0].localGroup;
  assert.notEqual(first,second);assert.equal(one.token,two.token);
  assert.ok(fs.existsSync(path.join(tmp,'support-transcripts',gid,first,'m0-a0')));
  assert.ok(fs.existsSync(path.join(tmp,'support-transcripts',gid,second,'m0-a0')));
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('online transcript serves attachments only with matching high-entropy token, not by guessed filename',async()=>{
 const {startWebsite}=require('../src/website'),{once}=require('node:events');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'novora-v44-http-'));
 let server;
 try{
  const ticket={id:'11111111-aaaa-4bbb-cccc-ffffffffffff',channelId:'555555555555555555',userId,createdAt:1};
  const store={state:{},dataDir:tmp,persist:async()=>{}};
  const channel={id:ticket.channelId,messages:{fetch:async()=>new Map([['x',{id:'555555555555555556',author:{id:userId},content:'Bild',attachments:new Map([['x',{name:'Frage-Screenshot.png',url:'https://cdn.discordapp.com/attachments/1/2/ss.png'}]])}]])}};
  const result=await archiveTicket({store,channel,guild:{id:gid},ticket,fetchFn:async()=>new Response(Buffer.from('IMAGE'),{status:200})});
  server=startWebsite({port:0,publicUrl:'http://127.0.0.1',websiteUrl:'https://example.invalid',store});
  if(!server.listening)await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}`;
  const bad=await fetch(url+'/transcript/attachment?token=wrong&file=m0-a0');assert.equal(bad.status,404);
  const html=await fetch(url+`/transcript?token=${result.token}`);assert.equal(html.status,200);
  assert.match(await html.text(),/Frage-Screenshot.png/);
  const good=await fetch(url+`/transcript/attachment?token=${result.token}&file=m0-a0`);
  assert.equal(good.status,200);assert.equal(await good.text(),'IMAGE');
  assert.equal(good.headers.get('content-type'),'application/octet-stream');
 }finally{if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true})}
});
