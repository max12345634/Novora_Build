'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const old=Module._load;Module._load=function(n,...args){if(n==='discord.js')return require('./discord-stub');return old.call(this,n,...args);};
const {makePartnerships}=require('../src/partnerships');
const {makeSupportSuite}=require('../src/support-suite');
Module._load=old;
const guildId='123456789012345678';const userId='234567890123456789';
function fakeMenu(prefix,choice,store){
  let showed=0,edits=0,lastModal=null;
  const it={customId:prefix,guildId,user:{id:userId},values:[choice],guild:{id:guildId},
    inGuild:()=>true,isChatInputCommand:()=>false,isStringSelectMenu:()=>true,isButton:()=>false,isModalSubmit:()=>false,
    message:{edit:async p=>{edits++;assert.equal(showed,edits);assert.ok(p.components?.length)}},
    showModal:async m=>{showed++;lastModal=m;},reply:async()=>{throw Error('Unexpected failure reply')}};
  return {it,get:()=>({showed,edits,modal:lastModal})};
}
test('Partnership dropdown opens the same modal twice and resets the shared panel',async()=>{
 const store={state:{partnershipRecords:{},partnershipTickets:{},partnershipSettings:{},appEmojis:{}},persist:async()=>{}};
 const client={guilds:{cache:new Map()},user:{id:userId}};
 const bot=makePartnerships({client,store});
 const x=fakeMenu('nvp:select:'+guildId,'apply');
 assert.equal(await bot.onInteraction(x.it),true);assert.equal(await bot.onInteraction(x.it),true);
 assert.equal(x.get().showed,2);assert.equal(x.get().edits,2);
 assert.equal(x.get().modal.data.title,'Partnerschaft beantragen');
});
test('Support dropdown opens the same ticket category repeatedly and resets the shared panel',async()=>{
 const store={state:{supportSettings:{[guildId]:{tickets:{panelId:'2',categoryId:'3',teamRoleId:'4'}}},appEmojis:{}},persist:async()=>{}};
 const client={guilds:{cache:new Map()},user:{id:userId}};
 const bot=makeSupportSuite({client,store});
 const x=fakeMenu('nvs:choose:'+guildId,'question');
 x.it.guild.name='Dresden City';x.it.guild.iconURL=()=>null;
 assert.equal(await bot.onInteraction(x.it),true);assert.equal(await bot.onInteraction(x.it),true);
 assert.equal(x.get().showed,2);assert.equal(x.get().edits,2);
});
