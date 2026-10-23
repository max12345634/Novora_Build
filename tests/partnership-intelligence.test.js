'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {TIERS,tierFor,scorePartnership,tierCount}=require('../src/partnership-analysis');
const original=Module._load;
let partnership;
try{
  Module._load=function(name,parent,isMain){if(name==='discord.js')return {ChannelType:{GuildText:0,GuildCategory:4,GuildForum:15},PermissionFlagsBits:{Administrator:8n}};return original.call(this,name,parent,isMain)};
  partnership=require('../src/partnerships');
}finally{Module._load=original;}
const form={server:'Dresden City',invite:'https://discord.gg/Example9',members:100,advert:'Wir sind eine aktive Roleplay Community mit Events und Support. Unsere Regeln und das Team sind freundlich. Unsere Community veranstaltet regelmäßige Events und ein spezielles Konzept für neue Leute.',extra:'Unsere Ansprechpartner antworten in der Regel schnell und wir haben ein öffentliches Regelwerk.'};
test('Grenzen für Klein, Mittel, Groß überlappen nicht',()=>{
 for(const [value,want] of [[-1,null],[0,null],[1,'small'],[99,'small'],[100,'small'],[101,'medium'],[699,'medium'],[700,'large'],[701,'large'],[999999,'large'],[1.5,null],[NaN,null]])assert.equal(tierFor(value),want);
 assert.equal(TIERS.small.max,100);assert.equal(TIERS.medium.min,101);assert.equal(TIERS.large.min,700);
});
test('regelbasierte Bewertung sagt ausdrücklich keine automatische Entscheidung zu',()=>{
 const a=scorePartnership(form,{inviteVerified:true});assert.ok(a.score>=75);assert.ok(a.score<=100);
 assert.equal(a.manualReview,true);assert.match(a.method,/regelbasierte/);
 assert.ok(!JSON.stringify(a).includes('automatisch annehmen'));
});
test('niedrigere Vollständigkeit bekommt kein künstlich hohes Ergebnis',()=>{
 const bad=scorePartnership({server:'Hi',invite:'',members:null,advert:'',extra:''});
 assert.ok(bad.score<=35);assert.ok(bad.warnings.length>=2);
});
test('dubiose Werbung erzeugt Warnsignal, wird aber nicht automatisch abgelehnt',()=>{
 const a=scorePartnership({...form,advert:form.advert+' gratis nitro free nitro'},{inviteVerified:true});
 assert.ok(a.warnings.some(x=>x.includes('Sicherheitsprüfung')));assert.equal(a.manualReview,true);
});
test('Antworten des Antragstellers können Qualitätsprüfung ergänzen ohne Rohtexte zu speichern',()=>{
 const a=scorePartnership({...form,advert:'Ein RP-Server',extra:''},{inviteVerified:true,applicantNotes:'Wir haben regelmäßige Events und richten gerade ein eigenes Regelwerk und zusätzliche Moderatoren ein.'});
 assert.ok(a.checks.some(x=>x.includes('Ticket')));assert.ok(!JSON.stringify(a).includes('Wir haben regelmäßige'));
});
test('Teamstatistik zählt pro Discord-Server, berücksichtigt nur aktive Partner',()=>{
 const c=tierCount({a:{guildId:'1',status:'active',members:100},b:{guildId:'1',status:'active',members:101},c:{guildId:'1',status:'active',tier:'large',members:1500},d:{guildId:'1',status:'ended',members:800},e:{guildId:'2',status:'active',members:900}},'1');
 assert.deepEqual(c,{small:1,medium:1,large:1,active:3});
});
test('Änderung übernimmt leere Eingaben aus bisherigem Partnerprofil',()=>{
 const old={...form,members:100,inviteVerified:true};
 const result=partnership.formForChange(old,{server:form.server,members:701,advert:'',extra:'',invite:''});
 assert.equal(result.members,701);assert.equal(result.invite,form.invite);assert.equal(result.advert,form.advert);assert.equal(tierFor(result.members),'large');
});
test('Forum-Tags werden hinzugefügt ohne vorhandene Tags zu löschen',async()=>{
 const forum={availableTags:[{id:'A',name:'Community',moderated:false}],async setAvailableTags(tags){this.availableTags=tags.map((tag,i)=>({...tag,id:tag.id||'T'+i}));}};
 const tags=await partnership.ensureForumTags(forum);
 assert.ok(forum.availableTags.some(x=>x.name==='Community'));
 assert.equal(forum.availableTags.length,4);
 assert.ok(tags['Kleine Partnerschaft']);assert.ok(tags['Mittel · Partner']);assert.ok(tags['Große Partnerschaft']);
});
test('Forum-Tags bleiben stabil wenn bereits angelegt',async()=>{
 const forum={availableTags:Object.values(TIERS).map((x,i)=>({name:x.forumTag,id:String(i)})),async setAvailableTags(){throw Error('Unnötige Aktualisierung')}};
 const tags=await partnership.ensureForumTags(forum);
 assert.equal(Object.keys(tags).length,3);
});
test('Forumbeitrag enthält nur konfigurierte Ping-Rolle',()=>{
 const store={state:{appEmojis:{nv_partner_small:'123456789012345678'}}};
 const ticket={form,requesterId:'111111111111111111',claimedBy:'222222222222222222',tier:'small'};
 const p=partnership.forumContent(ticket,{pingRoleId:'333333333333333333'},store);
 assert.match(p.content,/Kleine Partnerschaft/);assert.ok(p.content.includes('<:nv_partner_small_flat:123456789012345678>'));
 assert.deepEqual(p.allowedMentions,{parse:[],roles:['333333333333333333'],users:[]});
});
test('alle sechs gezeichneten Partnerschafts-Emojis liegen als PNG+SVG vor',()=>{
 const names=['nv_partner','nv_partner_edit','nv_partner_end','nv_partner_small','nv_partner_medium','nv_partner_large'];
 for(const n of names){const png=fs.readFileSync(path.join(__dirname,'../assets/emojis',n+'.png'));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),128);assert.equal(png.readUInt32BE(20),128);assert.ok(png.length<256*1024);assert.ok(fs.existsSync(path.join(__dirname,'../assets/emojis',n+'.svg')))}
});
test('Bot-Hauptprogramm lädt Ticketverwaltung und schaltet sie vor Verify-Handler',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../src/bot-main.js'),'utf8');
 assert.equal((s.match(/const \{ makePartnerships \} = require\('\.\/partnerships'\)/g)||[]).length,1);
 assert.ok(s.indexOf('partnershipSystem.onInteraction(interaction)')>0);
 assert.ok(s.includes('partnershipSystem.refreshCounts'));
});

test('alle Discord-Forum-Tag-Bezeichnungen bleiben unter 21 Zeichen',()=>{
 for(const cfg of Object.values(TIERS))assert.ok(cfg.forumTag.length<=20,cfg.forumTag);
});
test('vorhandene Server-Emojis werden an Forum-Tags gebunden',async()=>{
 const emojis=new Map([['1',{id:'999',name:'nv_partner_small'}]]);emojis.find=cb=>[...emojis.values()].find(cb);
 const forum={guild:{emojis:{cache:emojis}},availableTags:[],async setAvailableTags(tags){this.availableTags=tags.map((x,i)=>({...x,id:String(i+1)}));}};
 await partnership.ensureForumTags(forum);
 const found=forum.availableTags.find(x=>x.name===TIERS.small.forumTag);
 assert.deepEqual(found.emoji,{id:'999'});
});
