'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {defaults,validatePatch,recordAudit,stats}=require('../src/control');
test('settings schema accepts only known safe values',()=>{
  assert.deepEqual(validatePatch({panelTitle:'Hallo',panelColor:'#AABBCC',showOauth:false,verificationPaused:true}),{panelTitle:'Hallo',panelColor:'#aabbcc',showOauth:false,verificationPaused:true});
  assert.throws(()=>validatePatch({roleId:'123'}),/Unbekannte/);
  assert.throws(()=>validatePatch({panelColor:'red'}),/Farbe/);
  assert.equal(validatePatch({panelDescription:'Zeile 1\nZeile 2'}).panelDescription,'Zeile 1\nZeile 2');
  assert.throws(()=>validatePatch({verificationPaused:'yes'}),/true oder false/);
});
test('defaults and pause enable correct values',()=>{
  assert.equal(defaults({verificationPaused:true}).verificationPaused,true);
  assert.equal(defaults({verificationPaused:false}).verificationPaused,false);
});
test('audit retains last 500 events',()=>{
  const state={state:{}};
  for(let i=0;i<550;i++)recordAudit(state,{guildId:'123',actorId:'456',action:'change',details:String(i)});
  assert.equal(state.state.audit.length,500);
  assert.equal(state.state.audit[0].details,'549');
});
test('analytics shows guild-scoped stats without cross-server leakage',()=>{
  const state={members:{a:{verifiedGuildIds:['g1'],counts:{g1:3,g2:9},verifiedAt:Date.now(),transfer:{allowedTargets:['g1']}},b:{verifiedGuildIds:['g2'],counts:{g2:7},verifiedAt:Date.now(),transfer:{allowedTargets:[]}}},audit:[]};
  const scoped=stats(state,'g1');
  assert.equal(scoped.verifiedMembers,1);assert.equal(scoped.messages,3);assert.equal(scoped.oauthConsents,1);
  assert.equal(stats(state).messages,19);
});
