'use strict';
// Local, fail-closed release builder. Signing key is never bundled or printed.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const updater=require('../src/updater');
const root=path.resolve(__dirname,'..');
const version=process.argv[2];
const out=path.resolve(process.argv[3]||path.join(root,'release-output'));
const keyFile=process.env.NOVORA_SIGNING_KEY_FILE;
if(!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('Usage: NOVORA_SIGNING_KEY_FILE=/secure/key.pem node scripts/build-signed-release.js 4.18.0 [output-directory]');
if(!keyFile)throw Error('NOVORA_SIGNING_KEY_FILE fehlt. Kein unsigniertes Release wird erstellt.');
// A correctly signed release with a stale version-label would be reinstalled
// every poll. Require the executable's version and the manifest to agree.
const packageVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const labelVersion=require('../src/version-label').VERSION;
if(packageVersion!==version||labelVersion!==version)
  throw Error('Release-Version stimmt nicht mit package.json und src/version-label.js überein');

const key=crypto.createPrivateKey(fs.readFileSync(keyFile));
if(key.asymmetricKeyType!=='ed25519')throw Error('Nur Ed25519-Schlüssel sind erlaubt');
const candidates=[];
for(const dir of ['src','assets/banners','assets/emojis','assets/audio']){
  const full=path.join(root,dir);
  if(!fs.existsSync(full))continue;
  for(const entry of fs.readdirSync(full,{withFileTypes:true})){
    if(!entry.isFile())continue;
    const relative=dir+'/'+entry.name;
    if(updater.safePath(relative))candidates.push(relative);
  }
}
candidates.sort();
fs.mkdirSync(path.dirname(out),{recursive:true});
const stage=fs.mkdtempSync(path.join(path.dirname(out),'.novora-release-'));
try{
  const files=[];
  for(const relative of candidates){
    const full=path.join(root,relative);
    const stat=fs.lstatSync(full);
    if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsichere Datei: '+relative);
    const bytes=fs.readFileSync(full);
    if(relative.endsWith('.js'))execFileSync(process.execPath,['--check',full],{timeout:8000});
    updater.checkFileFormat(relative,bytes);
    const name=relative.replaceAll('/','--');
    const url='/novora-releases/'+version+'/'+name+'.txt';
    if(!updater.validReleaseUrl(url))throw Error('Ungültige Release-URL: '+url);
    files.push({path:relative,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),url});
    const target=path.join(stage,'novora-releases',version,name+'.txt');
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  }
  const payload={schema:1,version,files};
  const signature=crypto.sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64');
  const manifest={...payload,signature};
  updater.validateManifest(manifest); // Must match pinned public key, not merely any Ed25519 key.
  const target=path.join(stage,'novora-releases','latest.json');
  fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');
  if(fs.existsSync(out))throw Error('Ausgabeordner existiert bereits; wird nicht überschrieben');
  fs.renameSync(stage,out);
  console.log('Gültig signiertes Release vorbereitet: '+version+' ('+files.length+' Dateien).');
  console.log('Veröffentliche den Ordner novora-releases atomar; latest.json zuletzt.');
}catch(err){fs.rmSync(stage,{recursive:true,force:true});throw err}
