'use strict';

// Fail-closed release decision for GitHub Actions. The job is allowed to use
// signing secrets only after this gate has validated the checked-out version,
// release notes and the signed live feed.
const fs=require('node:fs');
const path=require('node:path');
const {setGlobalDispatcher,EnvHttpProxyAgent}=require('undici');
const {compareVersions}=require('../src/version');
const updater=require('../src/updater');
const {RELEASE_BASE_URL}=require('../src/release-trust');

const root=path.resolve(__dirname,'..');
const VERSION_RE=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function configureProxy(env=process.env){
  if(env.HTTPS_PROXY||env.https_proxy)setGlobalDispatcher(new EnvHttpProxyAgent());
}

function localRelease(rootDir=root){
  const pkg=JSON.parse(fs.readFileSync(path.join(rootDir,'package.json'),'utf8'));
  const version=String(pkg.version||'');
  if(!VERSION_RE.test(version))throw Error('package.json enthält keine gültige Patchversion');
  const labelFile=path.join(rootDir,'src','version-label.js');
  delete require.cache[require.resolve(labelFile)];
  const label=String(require(labelFile).VERSION||'');
  if(label!==version)throw Error('package.json und src/version-label.js haben unterschiedliche Versionen');
  const lock=JSON.parse(fs.readFileSync(path.join(rootDir,'package-lock.json'),'utf8'));
  const lockVersions=[lock.version,lock.packages&&lock.packages['']&&lock.packages[''].version];
  if(lockVersions.some(value=>String(value||'')!==version))
    throw Error('package-lock.json stimmt nicht mit der Release-Version überein');
  const changelog=path.join(rootDir,'release-notes',version+'.md');
  if(!fs.existsSync(changelog))throw Error('Release-Notizen fehlen: release-notes/'+version+'.md');
  const notes=fs.readFileSync(changelog,'utf8').trim();
  if(notes.length<3||notes.length>4000)throw Error('Release-Notizen müssen 3 bis 4000 Zeichen enthalten');
  return {version,changelog,notes};
}

function decideRelease(local,remote){
  if(!local||!VERSION_RE.test(String(local.version||'')))throw Error('Lokale Version ist ungültig');
  if(remote&&remote.status==='empty')return {publish:true,reason:'feed-empty'};
  if(!remote||typeof remote!=='object')throw Error('Release-Feed enthält kein Objekt');
  updater.validateManifest(remote);
  const order=compareVersions(local.version,remote.version);
  if(order<0)throw Error(`Lokale Version ${local.version} ist älter als Live ${remote.version}`);
  if(order===0)return {publish:false,reason:'already-live'};
  return {publish:true,reason:'new-version'};
}

async function readLimited(response,maxBytes){
  const declared=Number(response.headers.get('content-length')||'0');
  if(Number.isFinite(declared)&&declared>maxBytes)throw Error('Release-Feed ist zu groß');
  const reader=response.body&&response.body.getReader();
  if(!reader)return Buffer.alloc(0);
  const chunks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>maxBytes)throw Error('Release-Feed ist zu groß');
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock()}
  return Buffer.concat(chunks,total);
}

async function fetchFeed(fetchImpl=fetch,attempts=3){
  let last;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetchImpl(RELEASE_BASE_URL+'/novora-releases/latest.json',{
        redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)
      });
      if(!response.ok)throw Error('Release-Feed antwortet mit HTTP '+response.status);
      return JSON.parse((await readLimited(response,256*1024)).toString('utf8'));
    }catch(error){
      last=error;
      if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,500*attempt));
    }
  }
  throw last||Error('Release-Feed nicht erreichbar');
}

function writeOutputs(result,outputFile=process.env.GITHUB_OUTPUT){
  const lines=[
    'publish='+(result.publish?'true':'false'),
    'version='+result.version,
    'changelog='+result.changelog.replaceAll('\\','/'),
    'reason='+result.reason
  ];
  if(outputFile)fs.appendFileSync(outputFile,lines.join('\n')+'\n');
  else console.log(JSON.stringify(result));
}

async function run(){
  configureProxy();
  const local=localRelease();
  const remote=await fetchFeed();
  const decision=decideRelease(local,remote);
  const result={...local,...decision,changelog:path.relative(root,local.changelog)};
  writeOutputs(result);
  console.log(decision.publish
    ?`Release ${local.version} ist neuer als der signierte Live-Feed.`
    :`Release ${local.version} ist bereits live; keine doppelte Veröffentlichung.`);
  return result;
}

if(require.main===module)run().catch(error=>{console.error('RELEASE-GATE FEHLGESCHLAGEN: '+error.message);process.exitCode=1});
module.exports={VERSION_RE,localRelease,decideRelease,fetchFeed,writeOutputs,run};
