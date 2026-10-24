'use strict';
// One fail-closed command for scheduled development runs: test, sign, upload,
// activate and verify. It never deploys or edits the Control Center website.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const version=String(process.argv[2]||'');
const changelog=process.argv[3];
if(!/^\d+\.\d+\.\d+$/.test(version)||!changelog)throw Error('Aufruf: node scripts/automated-release.js <Version> <Changelog-Datei>');
for(const name of ['NOVORA_SIGNING_KEY_FILE','NOVORA_PUBLISHER_KEY_FILE'])if(!process.env[name])throw Error(name+' fehlt');

const out=path.join(root,'release-output',version);
function run(args){
  const result=spawnSync(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Abbruch nach fehlgeschlagenem Schritt: '+args.join(' '));
}

if(fs.existsSync(out))fs.rmSync(out,{recursive:true,force:true});
run(['--check','scripts/publish-github-release.js']);
run(['--test',...fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.js')).map(name=>'tests/'+name)]);
run(['scripts/build-signed-release.js',version,out]);
run(['scripts/verify-release-output.js',out]);
run(['scripts/publish-github-release.js',out,changelog]);
console.log('Automatischer Release-Lauf vollständig abgeschlossen: '+version);
