'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeBridge}=require('../src/bridge');
const {startWebsite}=require('../src/website');
const GUILD='123456789012345678',ADMIN='234567890123456789';

test('V4.17.5: HTTP bridge contract protects ticket/voice case actions and returns a confirmed state',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nv-contract-'));
  const actions=[];
  const support={
    async findDashboardCase(guildId,adminId,kind,caseId){
      if(adminId!==ADMIN||guildId!==GUILD)throw Error('Nur Administratoren');
      return caseId==='voice-1'?{ok:true,found:true,kind,case:{id:caseId,status:'waiting'}}:{ok:false,found:false};
    },
    async dashboardAction(guildId,adminId,kind,id,action){
      if(adminId!==ADMIN||guildId!==GUILD)throw Error('Nur Administratoren');
      actions.push({kind,id,action});
      if(kind==='voice'&&action==='close')return {ok:true,case:{id,status:'closed'}};
      if(kind==='ticket'&&action==='claim')return {ok:true,ticket:{id,status:'claimed'},status:'claimed'};
      throw Error('Unbekannte Aktion');
    }
  };
  const bridge=makeBridge({dir,support,snapshot:()=>({guilds:[],members:[]})});
  const code=bridge.newCode(),token=bridge.pair(code).body.token;
  const server=startWebsite({port:0,publicUrl:'https://test.example.org',websiteUrl:'https://dashboard.example.org',bridge,oauth:null,store:{state:{guilds:{},members:{}}},client:{guilds:{cache:new Map()}},verified:async()=>{}});
  try{
    await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const payload={guildId:GUILD,adminId:ADMIN,kind:'voice',id:'voice-1',action:'close'};
    const post=(body,auth)=>fetch(base+'/api/bridge/support/action',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    assert.equal((await post(payload,false)).status,401);
    assert.equal(actions.length,0);
    const wrong=await post({...payload,adminId:'999999999999999999'},true);
    assert.equal(wrong.status,403);
    assert.equal(actions.length,0);
    const valid=await post(payload,true);
    assert.equal(valid.status,200);
    assert.deepEqual(await valid.json(),{ok:true,case:{id:'voice-1',status:'closed'}});
    assert.deepEqual(actions,[{kind:'voice',id:'voice-1',action:'close'}]);
    const notFound=await fetch(base+'/api/bridge/support/case?guildId='+GUILD+'&adminId='+ADMIN+'&kind=voice&caseId=unknown',{headers:{Authorization:'Bearer '+token}});
    assert.equal(notFound.status,404);
    const found=await fetch(base+'/api/bridge/support/case?guildId='+GUILD+'&adminId='+ADMIN+'&kind=voice&caseId=voice-1',{headers:{Authorization:'Bearer '+token}});
    assert.equal(found.status,200);
    assert.equal((await found.json()).case.status,'waiting');
  }finally{server.close();fs.rmSync(dir,{recursive:true,force:true})}
});
