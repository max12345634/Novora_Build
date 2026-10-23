'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {refreshSavedPanel}=require('../src/panel-sync');
const payload=()=>({flags:32768,components:[{type:17,components:[{type:10,content:'Novora'}]}]});
function harness({author='bot',legacy=true,storeFail=false,deleteFail=false,restoreFail=false}={}){
 const events=[];
 let tracked='old';
 const old={id:'old',author:{id:author},flags:legacy?0:32768,embeds:legacy?[{}]:[],
  edit:async()=>events.push('edit'),
  delete:async()=>{events.push('delete-old');if(deleteFail)throw Error('missing permissions');}};
 const created={id:'new',delete:async()=>events.push('delete-new')};
 const channel={messages:{fetch:async()=>old},send:async()=>{events.push('send');return created;}};
 const guild={client:{user:{id:'bot'}},channels:{fetch:async()=>channel}};
 const onReplaced=async id=>{events.push('persist-'+id);tracked=id;
  if(id==='new'&&storeFail)throw Error('disk full');
  if(id==='old'&&restoreFail)throw Error('disk full');
 };
 return {guild,old,events,onReplaced,getTracked:()=>tracked};
}
test('V4.6: saved panel owned by another user is never edited or replaced',async()=>{
 const h=harness({author:'someone-else'});
 const result=await refreshSavedPanel({...h,channelId:'c',messageId:'old',makePayload:payload});
 assert.equal(result.status,'failed');assert.match(result.reason,/nicht von diesem Bot/);
 assert.deepEqual(h.events,[]);
});
test('V4.6: legacy panel refuses untracked migration without persistence callback',async()=>{
 const h=harness();
 const result=await refreshSavedPanel({guild:h.guild,channelId:'c',messageId:'old',makePayload:payload});
 assert.equal(result.status,'failed');assert.deepEqual(h.events,[]);
});
test('V4.6: persistence failure keeps original panel and removes replacement',async()=>{
 const h=harness({storeFail:true});
 const result=await refreshSavedPanel({...h,channelId:'c',messageId:'old',makePayload:payload,logger:{error(){},warn(){}}});
 assert.equal(result.status,'failed');assert.equal(h.getTracked(),'old');
 assert.deepEqual(h.events,['send','persist-new','persist-old','delete-new']);
});
test('V4.6: old-message delete failure restores tracked ID before cleanup',async()=>{
 const h=harness({deleteFail:true});
 const result=await refreshSavedPanel({...h,channelId:'c',messageId:'old',makePayload:payload});
 assert.equal(result.status,'failed');assert.equal(h.getTracked(),'old');
 assert.deepEqual(h.events,['send','persist-new','delete-old','persist-old','delete-new']);
});
test('V4.6: failed rollback does not delete the only potentially tracked replacement',async()=>{
 const h=harness({deleteFail:true,restoreFail:true});
 const result=await refreshSavedPanel({...h,channelId:'c',messageId:'old',makePayload:payload,logger:{error(){},warn(){}}});
 assert.equal(result.status,'failed');assert.match(result.reason,/Doppelung prüfen/);
 assert.equal(h.events.includes('delete-new'),false);
});
test('V4.6: malformed panel payload never edits or posts a message',async()=>{
 const h=harness({legacy:false});
 const result=await refreshSavedPanel({...h,channelId:'c',messageId:'old',makePayload:()=>({components:[]})});
 assert.equal(result.status,'failed');assert.deepEqual(h.events,[]);
});

test('V4.6: built-in changelog contains each release version exactly once',()=>{
 const {BUILTIN}=require('../src/changelog');
 const versions=BUILTIN.map(x=>x.version);
 assert.equal(new Set(versions).size,versions.length);
 assert.equal(versions[0],require('../package.json').version);
});
