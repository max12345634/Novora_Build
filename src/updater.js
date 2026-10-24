'use strict';
// HTTPS + Ed25519 signierte Novora-Releases; niemand kann per Dashboard JS einschleusen.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {compareVersions} = require('./version');
const {PUBLIC_KEY, RELEASE_BASE_URL} = require('./release-trust');
const PINNED_HOST = new URL(RELEASE_BASE_URL).hostname;
const MAX_FILES = 300, MAX_FILE_BYTES = 4 * 1024 * 1024, MAX_TOTAL_BYTES = 40 * 1024 * 1024;
function safePath(p) {
  if(typeof p!=='string')return false;
  // Constrained allowlist. Never touch secrets, installed packages, local data or
  // the trust roots/supervisor used to validate the next release.
  if(/^src\/[a-zA-Z0-9_-]+\.js$/.test(p))
    return !['src/supervisor.js','src/updater.js','src/version.js','src/release-trust.js'].includes(p);
  if(/^assets\/banners\/novora-[a-zA-Z0-9_-]+\.png$/.test(p))return true;
  if(/^assets\/emojis\/nv_[a-zA-Z0-9_-]+\.png$/.test(p))return true;
  if(/^assets\/audio\/(?:waiting-music|welcome-generic)\.ogg$/.test(p))return true;
  return false;
}
function validReleaseUrl(u){
  if(typeof u!=='string'||!/^\/novora-releases\/[a-zA-Z0-9_.\/-]+\.(?:txt|png|ogg)$/.test(u))return false;
  return u.split('/').every(part=>part!=='.'&&part!=='..');
}
function checkFileFormat(file,bytes){
  if(file.endsWith('.png')){
    if(bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.subarray(12,16).toString('ascii')!=='IHDR')
      throw Error('PNG-Datei ist beschädigt oder keine echte PNG: '+file);
    const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
    if(!w||!h||w>4096||h>4096)throw Error('PNG-Abmessungen ungültig: '+file);
  }else if(file.endsWith('.ogg')&&bytes.subarray(0,4).toString('ascii')!=='OggS')
    throw Error('OGG-Datei ist beschädigt: '+file);
}
function validateManifest(manifest) {
  if (!manifest || manifest.schema!==1 || !/^\d+\.\d+\.\d+$/.test(manifest.version||'')) throw Error('Ungültige Release-Version');
  if (!Array.isArray(manifest.files) || manifest.files.length===0 || manifest.files.length>MAX_FILES) throw Error('Ungültige Dateiliste');
  const seen=new Set(),urls=new Set();let total=0;
  for (const f of manifest.files) {
    if (!safePath(f.path) || seen.has(f.path) || !Number.isInteger(f.bytes) || f.bytes<1 || f.bytes>MAX_FILE_BYTES
      || !/^[a-f0-9]{64}$/.test(f.sha256||'') || !validReleaseUrl(f.url) || urls.has(f.url)) throw Error('Unsichere Release-Datei');
    seen.add(f.path);urls.add(f.url);total+=f.bytes;if(total>MAX_TOTAL_BYTES)throw Error('Release überschreitet das sichere Gesamtlimit');
  }
  if(!/^[a-zA-Z0-9+/=]{80,120}$/.test(manifest.signature||''))throw Error('Release-Signatur fehlt');
  const payload={schema:1,version:manifest.version,files:manifest.files};
  if(!crypto.verify(null,Buffer.from(JSON.stringify(payload)),PUBLIC_KEY,Buffer.from(manifest.signature,'base64')))throw Error('Release-Signatur ungültig');
  return payload;
}
function httpError(status){
  const info=status===404?['FEED_NOT_CONFIGURED','Release-Feed nicht eingerichtet (HTTP 404)']:
    status===403?['ACCESS_DENIED','Zugriff auf Release-Dienst verweigert (HTTP 403)']:
    status>=500?['SERVER_ERROR','Release-Dienst meldet Serverfehler (HTTP '+status+')']:
    ['HTTP_ERROR','HTTP '+status];
  const err=new Error(info[1]);err.code=info[0];err.status=status;return err;
}
async function fetchText(url, maxBytes, options={}) {
  const controller = new AbortController();
  const timer=setTimeout(()=>controller.abort(),16000);
  try {
    const result=await fetch(url,{signal:controller.signal,redirect:'error',headers:{'Accept':'application/json, text/plain'}});
    if(result.status===204&&options.allowEmpty)return null;
    if(!result.ok)throw httpError(result.status);
    const contentType=String(result.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(options.contentTypes?.length&&!options.contentTypes.includes(contentType))throw Error('Unerwarteter Content-Type: '+(contentType||'fehlt'));
    const declared=Number(result.headers.get('content-length')||'0');
    if(Number.isFinite(declared)&&declared>maxBytes)throw Error('Datei zu groß');
    if(!result.body)throw Error('Keine HTTP-Antwortdaten');
    const reader=result.body.getReader();
    const parts=[];let length=0;
    try {
      for(;;) {
        const {done,value}=await reader.read();
        if(done)break;
        length+=value.byteLength;
        if(length>maxBytes)throw Error('Datei zu groß');
        parts.push(Buffer.from(value));
      }
      return Buffer.concat(parts,length);
    }finally{reader.releaseLock()}

  }finally{clearTimeout(timer)}
}
function statusFile(root) {
  const d=path.resolve(process.env.DATA_DIR||path.join(root,'data'));
  fs.mkdirSync(d,{recursive:true,mode:0o700});return path.join(d,'update-status.json');
}
function saveStatus(root,update) {
  const file=statusFile(root);
  let current={};try{current=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
  const next={...current,...update}; const tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(tmp,file);
}
function releaseOrigin() {
  const candidate=process.env.NOVORA_RELEASE_BASE_URL||RELEASE_BASE_URL;
  const url=new URL(candidate);
  const expected=new URL(RELEASE_BASE_URL);
  if(url.protocol!=='https:'||url.hostname!==expected.hostname||url.username||url.password||url.port||url.pathname.replace(/\/$/,'')!==expected.pathname)
    throw Error('Auto-Update braucht den offiziellen Novora-Release-Dienst');
  return url.toString().replace(/\/$/,'');
}
async function checkRelease(root,currentVersion){
  const origin=releaseOrigin();
  const response=await fetchText(origin+'/novora-releases/latest.json',64000,{allowEmpty:true,contentTypes:['application/json','text/plain']});
  if(response===null)return null;
  let manifest;try{manifest=JSON.parse(response.toString('utf8'))}catch{throw Error('Release-Feed enthält kein gültiges JSON')}
  if(manifest?.schema===1&&manifest?.status==='empty')return null;
  validateManifest(manifest);
  if(compareVersions(manifest.version,currentVersion)<=0)return null;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'novora-stage-'));
  try {
    for(const f of manifest.files){
      const buf=await fetchText(origin+f.url,MAX_FILE_BYTES+1,{contentTypes:['application/octet-stream','text/plain','image/png','audio/ogg']});
      if(buf.length!==f.bytes||crypto.createHash('sha256').update(buf).digest('hex')!==f.sha256)throw Error('Datei-Prüfsumme stimmt nicht: '+f.path);
      checkFileFormat(f.path,buf);
      const target=path.join(dir,f.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,buf);
      if(f.path.endsWith('.js'))execFileSync(process.execPath,['--check',target],{timeout:8000,stdio:'pipe'});
    }
    return {manifest,dir};
  }catch(err){fs.rmSync(dir,{recursive:true,force:true});throw err;}
}
// A signed manifest is not sufficient on its own: a staged download can be
// altered after checkRelease() but before the worker is stopped and installed.
// Revalidate every staged byte and reject symlinks before touching live files.
function assertNoSymlinkComponents(base,relative){
  let current=path.resolve(base);
  for(const component of relative.split('/')){
    current=path.join(current,component);
    let stat;
    try{stat=fs.lstatSync(current)}catch(e){if(e.code==='ENOENT')continue;throw e;}
    if(stat.isSymbolicLink())throw Error('Symbolischer Link im Update-Pfad verboten: '+relative);
  }
}
function verifiedStage(root,download){
  const {manifest,dir}=download;
  validateManifest(manifest);
  if(typeof dir!=='string'||!fs.statSync(dir).isDirectory())throw Error('Update-Staging fehlt');
  for(const file of manifest.files){
    assertNoSymlinkComponents(dir,file.path);
    assertNoSymlinkComponents(root,file.path);
    const source=path.join(dir,file.path);
    const stat=fs.lstatSync(source);
    if(!stat.isFile()||stat.size!==file.bytes)throw Error('Update-Staging ungültig: '+file.path);
    const bytes=fs.readFileSync(source);
    if(bytes.length!==file.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)
      throw Error('Update-Staging Prüfsumme ungültig: '+file.path);
    checkFileFormat(file.path,bytes);
    if(file.path.endsWith('.js'))execFileSync(process.execPath,['--check',source],{timeout:8000,stdio:'pipe'});
  }
}
// Store recovery material alongside the bot's persistent state rather than in
// os.tmpdir(), which can disappear when the hosting container is recycled.
function recoveryJournal(root){
  return path.join(path.dirname(statusFile(root)),'update-recovery.json');
}
function pendingRecovery(root){
  const journal=recoveryJournal(root);
  if(!fs.existsSync(journal))return null;
  try{
    const data=JSON.parse(fs.readFileSync(journal,'utf8'));
    return {journal,backup:typeof data.backup==='string'?data.backup:null};
  }catch{return {journal,backup:null};} // A corrupt journal must also block startup.
}
function writeRecoveryJournal(root,backup,records){
  const journal=recoveryJournal(root);
  if(fs.existsSync(journal))throw Error('Offene Update-Wiederherstellung: '+journal);
  const tmp=journal+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
    const data={schema:2,createdAt:Date.now(),backup,files:records.map(({relative,existed,sha256,size})=>({path:relative,existed,...(existed?{sha256,size}:{})}))};
    const fd=fs.openSync(tmp,'wx',0o600);
    try{fs.writeFileSync(fd,JSON.stringify(data,null,2));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
    fs.renameSync(tmp,journal);
    // Make the rename durable before any live file is changed.
    const dirfd=fs.openSync(path.dirname(journal),'r');
    try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
  }finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true})}
}
function clearRecoveryJournal(root){
  const journal=recoveryJournal(root);
  fs.rmSync(journal,{force:true});
}
function ensureDiskSpace(root,manifest,statfs=fs.statfsSync){
  if(typeof statfs!=='function')return;
  const stats=statfs(path.dirname(statusFile(root)));
  const available=Number(stats.bavail)*Number(stats.bsize);
  const required=manifest.files.reduce((sum,file)=>{
    const target=path.join(root,file.path);let old=0;try{old=fs.lstatSync(target).size}catch{}
    return sum+file.bytes+old;
  },0)+1024*1024;
  if(!Number.isFinite(available)||available<required){const error=new Error('Nicht genügend Speicherplatz für Update und Sicherung');error.code='NO_SPACE';throw error}
}
function backupAndInstall(root,download){
  verifiedStage(root,download);
  if(pendingRecovery(root))throw Error('Offene Update-Wiederherstellung: '+recoveryJournal(root));
  const {manifest,dir}=download;
  ensureDiskSpace(root,manifest);
  const backupRoot=path.join(path.dirname(statusFile(root)),'update-backups');
  fs.mkdirSync(backupRoot,{recursive:true,mode:0o700});
  const backup=fs.mkdtempSync(path.join(backupRoot,'novora-backup-'));
  const records=[];
  let temp=null,journalWritten=false;
  try{
    // Back up ALL destinations before replacing the first one. A crash during
    // backup preparation therefore leaves the running installation untouched.
    for(const file of manifest.files){
      assertNoSymlinkComponents(root,file.path);
      const target=path.join(root,file.path),src=path.join(dir,file.path),old=path.join(backup,file.path);
      assertNoSymlinkComponents(dir,file.path);
      const existed=fs.existsSync(target);
      let sha256,size;
      if(existed){
        fs.mkdirSync(path.dirname(old),{recursive:true});
        fs.copyFileSync(target,old);
        const stat=fs.lstatSync(old);
        if(!stat.isFile())throw Error('Sicherung ist keine reguläre Datei: '+file.path);
        size=stat.size;sha256=hashFile(old);
      }
      records.push({target,old,existed,relative:file.path,sha256,size});
    }
    writeRecoveryJournal(root,backup,records);
    journalWritten=true;
    for(const file of manifest.files){
      assertNoSymlinkComponents(root,file.path);
      assertNoSymlinkComponents(dir,file.path);
      const target=path.join(root,file.path),src=path.join(dir,file.path);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      // Exclusive random temporary names prevent symlink and concurrent-write attacks.
      temp=target+'.novora-'+crypto.randomBytes(8).toString('hex')+'.tmp';
      fs.copyFileSync(src,temp,fs.constants.COPYFILE_EXCL);
      const bytes=fs.readFileSync(temp);
      if(bytes.length!==file.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)
        throw Error('Update-Prüfsumme vor Installation ungültig: '+file.path);
      const fd=fs.openSync(temp,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      fs.renameSync(temp,target);temp=null;
      const dirfd=fs.openSync(path.dirname(target),'r');try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
    }
  }catch(err){
    if(temp)try{fs.rmSync(temp,{force:true})}catch{}
    if(!journalWritten){
      // A filesystem error can occur after the journal rename but before the
      // directory fsync. No live file was changed yet, so discard that marker
      // before removing the backup; never leave a journal pointing to nothing.
      if(pendingRecovery(root)){
        try{clearRecoveryJournal(root)}catch(cleanupError){
          const critical=new Error('Update-Journal konnte nicht bereinigt werden; Sicherung: '+backup,{cause:cleanupError});
          critical.manualRecoveryRequired=true;critical.recoveryPath=backup;
          throw critical;
        }
      }
      fs.rmSync(backup,{recursive:true,force:true});throw err;
    }
    try{
      rollback(records);
      clearRecoveryJournal(root);
    }catch(restoreError){
      // Retain both journal and backup if the restore or journal cleanup fails.
      const critical=new Error('Installation fehlgeschlagen ('+err.message+'); '+restoreError.message+'; Sicherung: '+backup,{cause:err});
      critical.manualRecoveryRequired=true;
      critical.recoveryPath=backup;
      throw critical;
    }
    fs.rmSync(backup,{recursive:true,force:true});throw err;
  }
  return {
    rollback:()=>{
      try{rollback(records);clearRecoveryJournal(root)}catch(e){
        const critical=new Error(e.message+'; Sicherung: '+backup,{cause:e});
        critical.manualRecoveryRequired=true;
        critical.recoveryPath=backup;
        throw critical;
      }
      fs.rmSync(backup,{recursive:true,force:true});
    },
    finish:()=>{
      // Only called after the replacement worker reports ready. Keep a bounded,
      // persistent verified backup so an operator can also roll back later.
      const completed={schema:1,completedAt:Date.now(),files:records.map(r=>({path:r.relative,existed:r.existed,sha256:r.sha256,size:r.size}))};
      fs.writeFileSync(path.join(backup,'backup.json'),JSON.stringify(completed,null,2),{mode:0o600,flag:'wx'});
      clearRecoveryJournal(root);
      const retained=fs.readdirSync(backupRoot,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('novora-backup-')).map(e=>path.join(backupRoot,e.name)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
      for(const old of retained.slice(5))fs.rmSync(old,{recursive:true,force:true});
    }
  };
}


// Stream original backup files through a fixed-size buffer; never load an
// arbitrarily large existing installation file entirely into memory.
function hashFile(file){
  const hash=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(64*1024);
  const fd=fs.openSync(file,'r');
  try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));}
  finally{fs.closeSync(fd)}
  return hash.digest('hex');
}

// This is an OFFLINE repair tool, not an automatic startup action. Never trust
// paths read from the on-disk journal: the data directory can be writable.
function inspectRecovery(root){
  const journal=recoveryJournal(root);
  if(!fs.existsSync(journal))return {pending:false};
  if(!fs.lstatSync(journal).isFile())throw Error('Wiederherstellungsjournal ist keine reguläre Datei');
  let data;
  try{data=JSON.parse(fs.readFileSync(journal,'utf8'))}
  catch{throw Error('Wiederherstellungsjournal ist beschädigt; manuelle Prüfung erforderlich')}
  if(!data||data.schema!==2||!Array.isArray(data.files)||!data.files.length||data.files.length>MAX_FILES)
    throw Error('Unbekanntes Wiederherstellungsjournal; manuelle Prüfung erforderlich');
  const backupRoot=path.join(path.dirname(journal),'update-backups');
  if(typeof data.backup!=='string'||!path.isAbsolute(data.backup)||
     path.dirname(path.resolve(data.backup))!==path.resolve(backupRoot)||
     !/^novora-backup-[a-zA-Z0-9_-]{6,32}$/.test(path.basename(data.backup)))
    throw Error('Unsicherer Sicherungspfad im Journal');
  if(!fs.lstatSync(backupRoot).isDirectory()||!fs.lstatSync(data.backup).isDirectory())
    throw Error('Sicherungsverzeichnis ist ungültig');
  const seen=new Set(),records=[];
  for(const item of data.files){
    if(!item||!safePath(item.path)||seen.has(item.path)||typeof item.existed!=='boolean')
      throw Error('Unsicherer Dateieintrag im Journal');
    seen.add(item.path);
    assertNoSymlinkComponents(root,item.path);
    assertNoSymlinkComponents(data.backup,item.path);
    const target=path.join(root,item.path),old=path.join(data.backup,item.path);
    if(item.existed){
      if(!/^[a-f0-9]{64}$/.test(item.sha256||'')||!Number.isSafeInteger(item.size)||item.size<0)
        throw Error('Sicherungs-Prüfsumme fehlt: '+item.path);
      let stat;
      try{stat=fs.lstatSync(old)}catch{throw Error('Sicherungsdatei fehlt: '+item.path)}
      if(!stat.isFile()||stat.size!==item.size||hashFile(old)!==item.sha256)
        throw Error('Sicherungsdatei verändert oder beschädigt: '+item.path);
    }
    records.push({target,old,existed:item.existed,relative:item.path,sha256:item.sha256,size:item.size});
  }
  return {pending:true,journal,backup:data.backup,records};
}
function recoverPendingUpdate(root,{apply=false,botStopped=false}={}){
  const plan=inspectRecovery(root);
  if(!plan.pending)return {pending:false,restored:false};
  const summary={pending:true,backup:plan.backup,files:plan.records.length,restored:false};
  if(!apply)return summary;
  if(!botStopped)throw Error('Bot vor Wiederherstellung stoppen und --i-stopped-bot angeben');
  // Validate every source BEFORE modifying a single installed file.
  // Revalidate each source again while copying, to detect late tampering.
  for(const record of [...plan.records].reverse()){
    assertNoSymlinkComponents(root,record.relative);
    assertNoSymlinkComponents(plan.backup,record.relative);
    if(!record.existed){fs.rmSync(record.target,{force:true});continue}
    if(hashFile(record.old)!==record.sha256)throw Error('Sicherung während Wiederherstellung verändert: '+record.relative);
    const tmp=record.target+'.novora-recover-'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{
      fs.copyFileSync(record.old,tmp,fs.constants.COPYFILE_EXCL);
      if(fs.statSync(tmp).size!==record.size||hashFile(tmp)!==record.sha256)
        throw Error('Wiederherstellungs-Prüfsumme falsch: '+record.relative);
      fs.renameSync(tmp,record.target);
    }finally{fs.rmSync(tmp,{force:true})}
  }
  // Keep the journal if persisting success fails. Startup stays blocked and
  // rerunning recovery is safe after an interruption.
  saveStatus(root,{checking:false,manualRecoveryRequired:false,error:null,lastRecovered:Date.now()});
  clearRecoveryJournal(root);
  let backupRemoved=true;
  try{fs.rmSync(plan.backup,{recursive:true,force:true})}
  catch{backupRemoved=false}
  return {...summary,pending:false,restored:true,backupRemoved};
}

function rollback(records){
  // Validate ALL backup files before restoring ANY live file. A damaged backup
  // must not silently replace an installed module during automatic rollback.
  for(const {old,existed,sha256,size,relative,target} of records){
    if(!safePath(relative))throw Error('Rollback: unsicherer Dateipfad');
    const backupBase=path.resolve(old,...relative.split('/').map(()=>'..'));
    const targetBase=path.resolve(target,...relative.split('/').map(()=>'..'));
    assertNoSymlinkComponents(backupBase,relative);
    assertNoSymlinkComponents(targetBase,relative);
    if(existed){
      const stat=fs.lstatSync(old);
      if(!stat.isFile()||!Number.isSafeInteger(size)||stat.size!==size||
         !/^[a-f0-9]{64}$/.test(sha256||'')||hashFile(old)!==sha256)
        throw Error('Rollback: Sicherung beschädigt oder verändert: '+relative);
    }
  }
  const errors=[];
  for(const {target,old,existed,sha256,size,relative} of [...records].reverse()){
    let tmp=null;
    try{
      if(existed){
        if(hashFile(old)!==sha256)throw Error('Sicherung vor Rücksicherung verändert: '+relative);
        tmp=target+'.novora-rollback-'+crypto.randomBytes(8).toString('hex')+'.tmp';
        fs.copyFileSync(old,tmp,fs.constants.COPYFILE_EXCL);
        if(fs.lstatSync(tmp).size!==size||hashFile(tmp)!==sha256)
          throw Error('Rollback-Zieldatei konnte nicht verifiziert werden: '+relative);
        fs.renameSync(tmp,target);tmp=null;
      }else fs.rmSync(target,{force:true});
    }catch(e){errors.push(target+': '+e.message);console.error('ROLLBACK fehlgeschlagen:',target,e.message)}
    finally{if(tmp)try{fs.rmSync(tmp,{force:true})}catch{}}
  }
  if(errors.length)throw Error('Rollback fehlgeschlagen ('+errors.length+' Datei(en)): '+errors.join('; ').slice(0,400));
}
module.exports={safePath,validReleaseUrl,checkFileFormat,validateManifest,fetchText,releaseOrigin,checkRelease,backupAndInstall,ensureDiskSpace,saveStatus,statusFile,recoveryJournal,pendingRecovery,inspectRecovery,recoverPendingUpdate,PINNED_HOST};
