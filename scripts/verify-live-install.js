'use strict';

const {setGlobalDispatcher,EnvHttpProxyAgent}=require('undici');
const updater=require('../src/updater');
const {RELEASE_BASE_URL}=require('../src/release-trust');

const HEALTH_URL='https://6e8v8mfxpp.apps.bot-hosting.cloud/health';
const VERSION_RE=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function configureProxy(env=process.env){
  if(env.HTTPS_PROXY||env.https_proxy)setGlobalDispatcher(new EnvHttpProxyAgent());
}

async function textLimited(response,limit){
  const declared=Number(response.headers.get('content-length')||'0');
  if(Number.isFinite(declared)&&declared>limit)throw Error('Antwort überschreitet das Größenlimit');
  const reader=response.body&&response.body.getReader();
  if(!reader)return '';
  const chunks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>limit)throw Error('Antwort überschreitet das Größenlimit');
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock()}
  return Buffer.concat(chunks,total).toString('utf8');
}

async function verifyFeed(expected,fetchImpl=fetch){
  const response=await fetchImpl(RELEASE_BASE_URL+'/novora-releases/latest.json',{
    redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw Error('Release-Feed antwortet mit HTTP '+response.status);
  const manifest=JSON.parse(await textLimited(response,256*1024));
  updater.validateManifest(manifest);
  if(manifest.version!==expected)throw Error(`Feed meldet ${manifest.version} statt ${expected}`);
  return manifest;
}

async function healthVersion(fetchImpl=fetch){
  const response=await fetchImpl(HEALTH_URL,{redirect:'error',signal:AbortSignal.timeout(20000)});
  const body=(await textLimited(response,1024)).trim();
  if(!response.ok)throw Error('BotHosting-Healthcheck antwortet mit HTTP '+response.status);
  if(body!=='ok')throw Error('BotHosting-Healthcheck liefert nicht "ok"');
  return String(response.headers.get('x-novora-version')||'');
}

async function waitForVersion(expected,{fetchImpl=fetch,waitMs=15*60*1000,intervalMs=15000}={}){
  if(!VERSION_RE.test(String(expected||'')))throw Error('Erwartete Version ist ungültig');
  await verifyFeed(expected,fetchImpl);
  const deadline=Date.now()+waitMs;let last='';let error;
  do{
    try{last=await healthVersion(fetchImpl);error=null;if(last===expected)return {version:last,body:'ok'}}
    catch(value){error=value}
    if(Date.now()>=deadline)break;
    await new Promise(resolve=>setTimeout(resolve,intervalMs));
  }while(true);
  if(error)throw Error('BotHosting-Liveprüfung fehlgeschlagen: '+error.message);
  throw Error(`BotHosting meldet ${last||'keine Version'} statt ${expected}`);
}

async function run(){
  configureProxy();
  const expected=String(process.argv[2]||'');
  const result=await waitForVersion(expected);
  console.log(`BotHosting läuft nach regulärem Poll mit Version ${result.version}.`);
  return result;
}

if(require.main===module)run().catch(error=>{console.error('LIVE-PRÜFUNG FEHLGESCHLAGEN: '+error.message);process.exitCode=1});
module.exports={HEALTH_URL,verifyFeed,healthVersion,waitForVersion,run};
