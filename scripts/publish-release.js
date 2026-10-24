'use strict';
// Non-interactive publisher. It uploads only a locally verified, signed release.
// Neither private key is ever sent to AppDeploy or included in the release.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {verifyReleaseOutput}=require('./verify-release-output');
const {RELEASE_BASE_URL}=require('../src/release-trust');

// Node 22 fetch does not automatically honor the standard proxy variables used
// by managed automation runners. Configure Undici without exposing proxy data.
function configureProxy(){
  if(process.env.HTTPS_PROXY||process.env.https_proxy){
    const {EnvHttpProxyAgent,setGlobalDispatcher}=require('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  }
}

const PUBLISHER_FINGERPRINT='66f6eaa40f1eee265e94fde6fee05442b86bff1d713b0b9e8f775432a246a75d';
const CONTEXT='NOVORA-PUBLISH-V1';

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex')}
function canonical(action,timestamp,body){const bodyHash=sha256(JSON.stringify(body??{}));return {bodyHash,value:`${CONTEXT}\n${action}\n${timestamp}\n${bodyHash}`}}
function apiBase(){
  const configured=String(process.env.NOVORA_RELEASE_API_BASE||RELEASE_BASE_URL).replace(/\/+$/,'');
  if(configured===RELEASE_BASE_URL)return configured;
  const url=new URL(configured);
  if(process.env.NOVORA_PUBLISH_ALLOW_TEST_HTTP==='1'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))return configured;
  throw Error('NOVORA_RELEASE_API_BASE darf nur für lokale Tests überschrieben werden');
}
function privateKey(){
  const file=process.env.NOVORA_PUBLISHER_KEY_FILE;
  if(!file)throw Error('NOVORA_PUBLISHER_KEY_FILE fehlt');
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Publisher-Schlüssel muss eine reguläre Datei mit Modus 0600 sein');
  const key=crypto.createPrivateKey(fs.readFileSync(file));
  if(key.asymmetricKeyType!=='ed25519')throw Error('Publisher-Schlüssel muss Ed25519 verwenden');
  const fingerprint=sha256(crypto.createPublicKey(key).export({type:'spki',format:'der'}));
  if(fingerprint!==PUBLISHER_FINGERPRINT)throw Error('Publisher-Schlüssel gehört nicht zur hinterlegten Maschinenfreigabe');
  return {key,file:path.resolve(file)};
}
function signedHeaders(key,action,body){
  const timestamp=String(Date.now());
  const value=canonical(action,timestamp,body).value;
  return {'Content-Type':'application/json','X-Novora-Timestamp':timestamp,'X-Novora-Signature':crypto.sign(null,Buffer.from(value),key).toString('base64')};
}
async function requestJson(url,options,attempts=3){
  let last;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});
      const text=(await readLimited(response,64*1024)).toString('utf8');let body={};
      try{body=text?JSON.parse(text):{}}catch{throw Error('Publisher antwortete nicht mit JSON')}
      if(response.ok)return body;
      const failure=Object.assign(Error(String(body.error||`HTTP ${response.status}`).slice(0,240)),{status:response.status});
      if(response.status<500&&response.status!==409)throw failure;
      last=failure;
    }catch(error){last=error;if(Number(error.status||0)>0&&Number(error.status)<500&&Number(error.status)!==409)throw error}
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,250*attempt));
  }
  throw last||Error('Publisher-Anfrage fehlgeschlagen');
}
async function readLimited(response,maxBytes){
  const declared=Number(response.headers.get('content-length')||'0');
  if(Number.isFinite(declared)&&declared>maxBytes)throw Error('Publisher-Antwort überschreitet das Größenlimit');
  if(!response.body)return Buffer.alloc(0);
  const reader=response.body.getReader(),parts=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw Error('Publisher-Antwort überschreitet das Größenlimit');parts.push(Buffer.from(value))}}
  finally{reader.releaseLock()}
  return Buffer.concat(parts,length);
}
function readChangelog(value){
  if(!value)throw Error('Changelog-Datei fehlt');
  const text=fs.existsSync(value)?fs.readFileSync(value,'utf8'):String(value);
  const clean=text.trim();if(clean.length<3||clean.length>4000)throw Error('Changelog muss 3 bis 4000 Zeichen enthalten');return clean;
}
function sessionState(keyFile,manifest,changelog){
  const stateDir=path.dirname(keyFile),dirStat=fs.lstatSync(stateDir);
  if(!dirStat.isDirectory()||dirStat.isSymbolicLink()||(dirStat.mode&0o077)!==0)throw Error('Publisher-Schlüsselverzeichnis muss privat sein (Modus 0700)');
  const stateFile=path.join(stateDir,`.novora-publish-${manifest.version}.json`);
  const releaseHash=sha256(JSON.stringify({manifest,changelog}));
  if(fs.existsSync(stateFile)){
    const stat=fs.lstatSync(stateFile);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Unsichere Publisher-Sitzungsdatei');
    const saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    if(saved.releaseHash!==releaseHash||!/^[a-f0-9]{64}$/.test(saved.requestId||'')||!/^nvp_[a-f0-9]{64}$/.test(saved.sessionToken||''))throw Error('Publisher-Sitzung passt nicht zum Release');
    return {stateFile,...saved};
  }
  const state={releaseHash,requestId:crypto.randomBytes(32).toString('hex'),sessionToken:'nvp_'+crypto.randomBytes(32).toString('hex')};
  const temp=stateFile+'.tmp-'+crypto.randomBytes(12).toString('hex');fs.writeFileSync(temp,JSON.stringify(state),{mode:0o600,flag:'wx'});fs.renameSync(temp,stateFile);fs.chmodSync(stateFile,0o600);
  return {stateFile,...state};
}
async function verifyHosted(base,manifest){
  const response=await fetch(base+'/novora-releases/latest.json',{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Veröffentlichter Feed antwortet mit HTTP '+response.status);
  const hosted=JSON.parse((await readLimited(response,64*1024)).toString('utf8'));
  if(JSON.stringify(hosted)!==JSON.stringify(manifest))throw Error('Veröffentlichter Feed stimmt nicht bytegenau mit dem geprüften Manifest überein');
  let checked=0;
  for(const file of manifest.files){
    const download=await fetch(base+file.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!download.ok)throw Error('Veröffentlichte Datei fehlt: '+file.path+' (HTTP '+download.status+')');
    const bytes=await readLimited(download,file.bytes);
    if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256)throw Error('Veröffentlichte Datei ist beschädigt: '+file.path);
    checked++;
  }
  return checked;
}
function releaseFile(root,file){
  const releaseDir=path.resolve(root,'novora-releases'),resolved=path.resolve(root,file.url.slice(1));
  if(!resolved.startsWith(releaseDir+path.sep))throw Error('Release-Datei liegt außerhalb des geprüften Ordners: '+file.path);
  let current=root;
  for(const part of file.url.slice(1).split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Symlink im Release: '+file.path)}
  const fd=fs.openSync(resolved,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size!==file.bytes)throw Error('Release-Dateigröße wurde nach der Prüfung verändert: '+file.path);const bytes=fs.readFileSync(fd);if(sha256(bytes)!==file.sha256)throw Error('Release-Datei wurde nach der Prüfung verändert: '+file.path);return bytes}
  finally{fs.closeSync(fd)}
}
async function run(releaseRoot,changelogValue){
  configureProxy();
  const root=path.resolve(releaseRoot||'');
  const checked=verifyReleaseOutput(root);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'novora-releases','latest.json'),'utf8'));
  const changelog=readChangelog(changelogValue);
  const publisher=privateKey();const state=sessionState(publisher.file,manifest,changelog);const base=apiBase();
  const beginBody={manifest,changelog,requestId:state.requestId,sessionTokenHash:sha256(state.sessionToken)};
  const begin=await requestJson(base+'/automation/releases/begin',{method:'POST',headers:signedHeaders(publisher.key,'begin',beginBody),body:JSON.stringify(beginBody)});
  if(!begin.alreadyPublished){
    let uploaded=0;
    for(const file of manifest.files){
      const content=releaseFile(root,file).toString('base64');
      await requestJson(base+'/automation/releases/file',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.sessionToken},body:JSON.stringify({version:manifest.version,url:file.url,content})});
      uploaded++;if(uploaded===manifest.files.length||uploaded%20===0)console.log(`Upload geprüft: ${uploaded}/${manifest.files.length}`);
    }
    await requestJson(base+'/automation/releases/publish',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.sessionToken},body:JSON.stringify({version:manifest.version})});
  }
  const hostedFiles=await verifyHosted(base,manifest);fs.rmSync(state.stateFile,{force:true});
  console.log(`Release ${checked.version} automatisch veröffentlicht und erneut geprüft (${hostedFiles} Dateien).`);
  return {version:checked.version,files:hostedFiles,published:true};
}

if(require.main===module){
  run(process.argv[2],process.argv[3]).catch(error=>{console.error('AUTOMATISCHE VERÖFFENTLICHUNG FEHLGESCHLAGEN: '+error.message);process.exitCode=1});
}
module.exports={canonical,signedHeaders,run};
