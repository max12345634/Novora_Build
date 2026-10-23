'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const Module=require('node:module');const original=Module._load;Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return original.call(this,name,...args)};const {buildSupportLog}=require('../src/support-log-panel');Module._load=original;
test('Ticket log includes affected member and acting staff',()=>{
 const x=buildSupportLog('Ticket geschlossen · abcdef123456789012345 · User 123456789012345678 · Team 234567890123456789 · Nachrichten 5');
 const e=x.embeds[0].toJSON();assert.match(e.title,/Ticket geschlossen/);assert.ok(e.fields.some(f=>f.name==='Betroffenes Mitglied'&&f.value.includes('123456789012345678')));assert.ok(e.fields.some(f=>f.name==='Ausgeführt von'&&f.value.includes('234567890123456789')));assert.ok(Object.hasOwn(e,"timestamp"));assert.deepEqual(x.allowedMentions,{parse:[]});
});
test('Voice log identifies support case and room',()=>{const e=buildSupportLog('Voice-Support übernommen · aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa · User 123456789012345678 · Team 234567890123456789 · Raum 345678901234567890').embeds[0].toJSON();assert.match(e.title,/Voice/);assert.ok(e.fields.some(f=>f.name==='Sprachraum'&&f.value.includes('345678901234567890')));});
test('Missing actors explicitly marked',()=>{const e=buildSupportLog('Ticket geschlossen · abc').embeds[0].toJSON();assert.ok(e.fields.some(f=>f.name==='Ausgeführt von'&&f.value==='Nicht übermittelt'));});
test('Mentions do not ping and mass mentions sanitized',()=>{const x=buildSupportLog('Ticket eröffnet · @everyone');assert.deepEqual(x.allowedMentions,{parse:[]});assert.ok(!JSON.stringify(x.embeds[0].toJSON()).includes('@everyone'));});
