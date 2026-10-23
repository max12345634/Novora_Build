'use strict';
// Offline publication gate: verify the exact bytes to be served before publishing.
// No secret key is read; this checks signatures against the pinned bot trust root.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const updater=require('../src/updater');
function verifyReleaseOutput(root){
  root=path.resolve(root);
  const releaseDir=path.join(root,'novora-releases');
  const manifestFile=path.join(releaseDir,'latest.json');
  if(!fs.lstatSync(root).isDirectory()||!fs.lstatSync(releaseDir).isDirectory())throw Error('Release-Verzeichnis fehlt');
  if(!fs.lstatSync(manifestFile).isFile())throw Error('latest.json fehlt');
  if(fs.lstatSync(manifestFile).size>64000)throw Error('Manifest zu groß');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  updater.validateManifest(manifest);
  // A single hosted URL must never stand in for two distinct manifest entries.
  // This is a publication-side safety check, independent of the pinned trust root.
  const urls=new Set();
  for(const f of manifest.files){
    if(urls.has(f.url))throw Error('Doppelte Release-URL: '+f.url);
    urls.add(f.url);
    const url=f.url;
    if(!updater.validReleaseUrl(url))throw Error('Unsichere URL');
    const rel=url.substring(1);
    const resolved=path.resolve(root,rel);
    if(!resolved.startsWith(releaseDir+path.sep))throw Error('Datei außerhalb des Releases');
    let part=root;
    for(const component of rel.split('/')){
      part=path.join(part,component);
      if(fs.lstatSync(part).isSymbolicLink())throw Error('Symlink im Release: '+rel);
    }
    const stat=fs.lstatSync(resolved);
    if(!stat.isFile()||stat.size!==f.bytes)throw Error('Release-Dateigröße stimmt nicht: '+f.path);
    const bytes=fs.readFileSync(resolved);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('SHA-256 stimmt nicht: '+f.path);
    updater.checkFileFormat(f.path,bytes);
    if(f.path.endsWith('.js')){
      const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'novora-check-'));
      try{const file=path.join(tmp,'check.js');fs.writeFileSync(file,bytes);execFileSync(process.execPath,['--check',file],{timeout:8000,stdio:'pipe'});}finally{fs.rmSync(tmp,{recursive:true,force:true})}
    }
  }
  return {version:manifest.version,files:manifest.files.length,verified:true};
}
if(require.main===module){
  try{
    if(!process.argv[2])throw Error('Aufruf: node scripts/verify-release-output.js <release-root>');
    const result=verifyReleaseOutput(process.argv[2]);
    console.log('Release sicher geprüft: '+result.version+' ('+result.files+' Dateien, Signatur + SHA-256 + Syntax).');
  }catch(e){console.error('RELEASE ABGELEHNT: '+e.message);process.exitCode=1}
}
module.exports={verifyReleaseOutput};
