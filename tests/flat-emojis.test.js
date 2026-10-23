'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {uploadEmoji,names}=require('../src/emoji');

test('all eight v3.2 flat icons are valid transparent 128x128 PNGs within Discord size limit',()=>{
  for(const name of ['nv_verify','nv_key','nv_badge','nv_saturn','nv_audit','nv_alert','nv_role','nv_lock']){
    const file=fs.readFileSync(path.join(__dirname,'../assets/emojis',name+'.png'));
    assert.equal(file.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(file.readUInt32BE(16),128);
    assert.equal(file.readUInt32BE(20),128);
    assert.equal(file[25],6); // RGBA
    assert.ok(file.length<256*1024);
    assert.ok(fs.existsSync(path.join(__dirname,'../assets/emojis',name+'.svg')));
  }
});

test('emoji installer uploads clean names safely and resumes after restart', async()=>{
  const oldFetch=global.fetch, oldClient=process.env.DISCORD_CLIENT_ID, oldToken=process.env.DISCORD_TOKEN;
  let posts=0, saves=0;
  process.env.DISCORD_CLIENT_ID='123456789012345678';process.env.DISCORD_TOKEN='test-token';
  const state={appEmojis:{nv_verify:'old-style-icon'}};
  const store={state,persist:async()=>{saves++;}};
  try{
    global.fetch=async(url,opt={})=>{
      assert.ok(String(url).includes('/applications/123456789012345678/emojis'));
      if(opt.method!=='POST')return {ok:true,json:async()=>({items:[]})};
      const json=JSON.parse(opt.body);assert.ok(names.some(name=>json.name===name+'_flat'),'Unexpected emoji '+json.name);
      assert.ok(json.image.startsWith('data:image/png;base64,'));
      posts++;
      return {ok:true,json:async()=>({id:'1000000000000000'+posts})};
    };
    const e=await uploadEmoji({},store);
    assert.equal(Object.keys(e).length,names.length);
    assert.equal(state.emojiStyleVersion,'flat-v43');
    assert.equal(posts,names.length);assert.ok(saves>=8);
    await uploadEmoji({},store);
    assert.equal(posts,names.length);
  }finally{global.fetch=oldFetch;if(oldClient===undefined)delete process.env.DISCORD_CLIENT_ID;else process.env.DISCORD_CLIENT_ID=oldClient;if(oldToken===undefined)delete process.env.DISCORD_TOKEN;else process.env.DISCORD_TOKEN=oldToken;}
});
