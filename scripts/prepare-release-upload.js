'use strict';
// Generates a fail-closed, ordered upload plan; does NOT publish anything.
const fs=require('node:fs');
const path=require('node:path');
const {verifyReleaseOutput}=require('./verify-release-output');
function prepare(root){
  root=path.resolve(root);
  const checked=verifyReleaseOutput(root);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'novora-releases/latest.json'),'utf8'));
  const items=manifest.files.map(f=>({local:path.join(root,f.url.slice(1)),url:f.url,sha256:f.sha256,bytes:f.bytes}));
  for(const item of items){if(!fs.statSync(item.local).isFile())throw Error('Fehlende Datei: '+item.url)}
  return {version:checked.version,verified:true,files:items,commitLast:{local:path.join(root,'novora-releases/latest.json'),url:'/novora-releases/latest.json'},instructions:'Zuerst alle files unverändert hochladen und über HTTPS prüfen; latest.json erst nach erfolgreicher Prüfung aller Dateien als letzten Schritt atomar veröffentlichen. Kein Upload wurde durchgeführt.'};
}
if(require.main===module){
  try{
    if(!process.argv[2])throw Error('Aufruf: node scripts/prepare-release-upload.js <release-root> [plan.json]');
    const plan=prepare(process.argv[2]);
    const output=JSON.stringify(plan,null,2)+'\n';
    if(process.argv[3]){const target=path.resolve(process.argv[3]);fs.writeFileSync(target,output,{flag:'wx',mode:0o600});console.log('Verifizierter Upload-Plan erstellt: '+target)}
    else console.log(output);
  }catch(e){console.error('VERÖFFENTLICHUNG GESPERRT: '+e.message);process.exitCode=1}
}
module.exports={prepare};
