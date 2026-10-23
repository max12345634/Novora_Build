'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Module=require('node:module');const original=Module._load;
Module._load=function(name,...args){if(name==='discord.js')return require('./discord-stub');return original.call(this,name,...args);};
const {setupCommand}=require('../src/setup-menu');
const {makeSetupFlow,fields,choices,parseId}=require('../src/setup-flow');
Module._load=original;
test('Only one /setup command with no slash subcommands',()=>{
 const cmd=setupCommand.toJSON();assert.equal(cmd.name,'setup');assert.ok(!cmd.options?.length);
 assert.equal(cmd.default_member_permissions,'8');
 assert.equal(new Set(choices.map(c=>c.value)).size,choices.length);
 for(const category of ['tickets','voice','partnerschaft','verify','panel','logs','emojis','status'])assert.ok(choices.some(c=>c.value===category));
});
test('Setup registered only guild-scoped and duplicates cleaned up',()=>{
 const content=fs.readFileSync(path.resolve(__dirname,'../src/bot-main.js'),'utf8');
 assert.match(content,/client\.rest\.put\(Routes\.applicationGuildCommands\(env\.clientId,guild\.id\),\{body:\[payload\]\}\)/);
 assert.match(content,/client\.rest\.put\(Routes\.applicationCommands\(env\.clientId\),\{body:commands\}\)/);
 assert.match(content,/if\(names\.includes\('setup'\)/);
 assert.match(content,/if\(interaction\.isChatInputCommand\(\)\&\&interaction\.commandName==='setup'\)return setupFlow\.open\(interaction\)/);
 assert.doesNotMatch(content,/interaction\.options\.getSubcommand\(\)/);
});
test('Setup wizard accepts exactly one role and channel per required step, with valid labels',()=>{
 for(const [category,values] of Object.entries(fields)){
   assert.ok(choices.some(x=>x.value===category));
   for(const x of values){assert.ok(x.name.length<=100);assert.ok(['choice','role','channel'].includes(x.type));}
 }
 assert.equal(fields.verify[0].key,'rolle');assert.equal(fields.verify.at(-1).key,'kanal');assert.equal(fields.verify.at(-1).optional,undefined);
 assert.equal(fields.panel.at(-1).key,'kanal');
 assert.deepEqual(parseId('nvset:0123456789abcdef:menu'),{id:'0123456789abcdef',action:'menu'});
 assert.equal(parseId('nvset:improper:menu'),null);
});
test('Setup wizard is private and can reopen the same category',async()=>{
 const steps=[];const guild='123456789012345678';const admin='234567890123456789';
 const stub={guildId:guild,user:{id:admin},inGuild:()=>true,memberPermissions:{has:()=>true},
   reply:async payload=>{steps.push(payload);return payload},update:async payload=>{steps.push(payload);return payload},
   isStringSelectMenu:()=>true,isChannelSelectMenu:()=>false,isRoleSelectMenu:()=>false,isButton:()=>false};
 const flow=makeSetupFlow(async()=>{},{});
 await flow.open(stub);
 const customId=steps[0].components[0].components.find(x=>x.type===1).components[0].custom_id;
 assert.equal(steps[0].flags,64|32768);
 const sel={...stub,customId,values:['verify']};
 await flow.onInteraction(sel);
 assert.match(JSON.stringify(steps.at(-1).components),/Schritt 1 von 3/);
 await flow.onInteraction({...sel,customId:customId.replace(/:menu$/,':back'),isButton:()=>true});
 await flow.onInteraction(sel);
 assert.match(JSON.stringify(steps.at(-1).components),/Schritt 1 von 3/);
});
