'use strict';

// Publishes immutable signed artifacts to an atomic Git branch. AppDeploy only
// proxies and revalidates this branch, so normal releases consume no AppDeploy
// database/storage writes and no website deployment.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {verifyReleaseOutput}=require('./verify-release-output');
const {RELEASE_BASE_URL}=require('../src/release-trust');

const REMOTE='https://github.com/max12345634/Novora_Build.git';
const BRANCH='novora-releases';
const RAW='https://raw.githubusercontent.com/max12345634/Novora_Build/'+BRANCH+'/';
const PUBLISHER_FINGERPRINT='66f6eaa40f1eee265e94fde6fee05442b86bff1d713b0b9e8f775432a246a75d';

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex')}
function configureProxy(){if(process.env.HTTPS_PROXY||process.env.https_proxy){const {EnvHttpProxyAgent,setGlobalDispatcher}=require('undici');setGlobalDispatcher(new EnvHttpProxyAgent())}}
function publisherKey(){
  const file=process.env.NOVORA_PUBLISHER_KEY_FILE;if(!file)throw Error('NOVORA_PUBLISHER_KEY_FILE fehlt');
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Publisher-Schlüssel muss eine reguläre Datei mit Modus 0600 sein');
  const key=crypto.createPrivateKey(fs.readFileSync(file));if(key.asymmetricKeyType!=='ed25519')throw Error('Publisher-Schlüssel muss Ed25519 verwenden');
  if(sha256(crypto.createPublicKey(key).export({type:'spki',format:'der'}))!==PUBLISHER_FINGERPRINT)throw Error('Publisher-Schlüssel gehört nicht zur Maschinenfreigabe');
  return key;
}
function activationPayload(manifestText,version,publishedAt=Date.now()){
  return {schema:1,context:'NOVORA-GITHUB-RELEASE-V1',version,manifestSha256:sha256(manifestText),publishedAt};
}
function makeActivation(manifestText,version,key,publishedAt=Date.now()){
  const payload=activationPayload(manifestText,version,publishedAt);
  return {...payload,signature:crypto.sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64')};
}
function git(args,cwd,{capture=false,allowFailure=false}={}){
  const result=spawnSync('git',args,{cwd,encoding:'utf8',stdio:capture?'pipe':'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0&&!allowFailure)throw Error('Git-Befehl fehlgeschlagen: git '+args.join(' '));
  return capture?String(result.stdout||'').trim():result.status;
}
function branchExists(){
  const result=spawnSync('git',['ls-remote','--exit-code','--heads',REMOTE,BRANCH],{encoding:'utf8',stdio:'pipe'});
  if(result.error)throw result.error;
  if(result.status!==0&&result.status!==2)throw Error('GitHub-Release-Branch konnte nicht geprüft werden');
  return result.status===0;
}
function copyTree(source,target){
  for(const entry of fs.readdirSync(source,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error('Symlink im Release-Ausgabeordner');
    const from=path.join(source,entry.name),to=path.join(target,entry.name);
    if(entry.isDirectory()){fs.mkdirSync(to,{recursive:true});copyTree(from,to)}
    else if(entry.isFile())fs.copyFileSync(from,to);else throw Error('Unsicherer Release-Dateityp');
  }
}
async function readLimited(response,max){
  const declared=Number(response.headers.get('content-length')||'0');if(Number.isFinite(declared)&&declared>max)throw Error('Download überschreitet Größenlimit');
  const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);const parts=[];let total=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw Error('Download überschreitet Größenlimit');parts.push(Buffer.from(value))}}finally{reader.releaseLock()}
  return Buffer.concat(parts,total);
}
async function fetchBytes(url,max,attempts=5){
  let last;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('HTTP '+response.status);return await readLimited(response,max)}
    catch(error){last=error;if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,1000*attempt))}
  }
  throw last||Error('Download fehlgeschlagen');
}
async function verifyHosted(base,manifest,manifestText,activationText){
  const nonce='?v='+Date.now();
  const root=base.endsWith('/')?base:base+'/';
  const hostedManifest=await fetchBytes(root+'novora-releases/latest.json'+nonce,256*1024);
  let parsed;try{parsed=JSON.parse(hostedManifest.toString('utf8'))}catch{throw Error('Veröffentlichter Feed ist kein JSON')}
  if(JSON.stringify(parsed)!==JSON.stringify(manifest))throw Error('Veröffentlichter Feed stimmt nicht mit dem signierten Manifest überein');
  if(base===RAW){
    const hostedActivation=await fetchBytes(root+'novora-releases/activation.json'+nonce,16*1024);
    if(hostedActivation.toString('utf8').trim()!==activationText.trim())throw Error('GitHub-Aktivierung stimmt nicht überein');
  }
  let count=0;
  for(const file of manifest.files){
    const bytes=await fetchBytes(root+file.url.replace(/^\//,''),file.bytes);
    if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256)throw Error('Veröffentlichte Datei ist beschädigt: '+file.path);
    count++;if(count===manifest.files.length||count%20===0)console.log(`Extern geprüft: ${count}/${manifest.files.length}`);
  }
  return count;
}
async function run(releaseRoot){
  configureProxy();
  const root=path.resolve(releaseRoot||'');const checked=verifyReleaseOutput(root);const version=checked.version;
  const manifestFile=path.join(root,'novora-releases','latest.json');const manifestText=fs.readFileSync(manifestFile,'utf8');const manifest=JSON.parse(manifestText);
  const key=publisherKey();const temp=fs.mkdtempSync(path.join(os.tmpdir(),'novora-release-git-'));
  try{
    const exists=branchExists();
    if(exists)git(['clone','--depth','1','--single-branch','--branch',BRANCH,REMOTE,temp]);
    else{git(['init','-b',BRANCH],temp);git(['remote','add','origin',REMOTE],temp)}
    const releaseDir=path.join(temp,'novora-releases'),target=path.join(releaseDir,version);
    if(fs.existsSync(target))throw Error('GitHub-Release-Version existiert bereits und wird nicht überschrieben');
    fs.mkdirSync(target,{recursive:true});copyTree(path.join(root,'novora-releases',version),target);
    fs.copyFileSync(manifestFile,path.join(target,'manifest.json'));
    const activation=makeActivation(manifestText,version,key);const activationText=JSON.stringify(activation,null,2)+'\n';
    fs.writeFileSync(path.join(target,'activation.json'),activationText);
    fs.mkdirSync(releaseDir,{recursive:true});fs.copyFileSync(manifestFile,path.join(releaseDir,'latest.json'));fs.writeFileSync(path.join(releaseDir,'activation.json'),activationText);
    git(['config','user.name','Novora Release Publisher'],temp);git(['config','user.email','release@novora.invalid'],temp);
    git(['add','novora-releases'],temp);git(['commit','-m','Publish signed Novora '+version],temp);git(['push','origin','HEAD:refs/heads/'+BRANCH],temp);
    const rawFiles=await verifyHosted(RAW,manifest,manifestText,activationText);
    const proxiedFiles=await verifyHosted(RELEASE_BASE_URL+'/',manifest,manifestText,activationText);
    console.log(`Release ${version} atomar über GitHub veröffentlicht und durch AppDeploy geprüft (${rawFiles}/${proxiedFiles} Dateien).`);
    return {version,files:proxiedFiles,published:true};
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
}

if(require.main===module)run(process.argv[2]).catch(error=>{console.error('GITHUB-VERÖFFENTLICHUNG FEHLGESCHLAGEN: '+error.message);process.exitCode=1});
module.exports={activationPayload,makeActivation,run};
