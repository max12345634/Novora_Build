'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {safePath,checkFileFormat,validReleaseUrl,validateManifest}=require('../src/updater');
test('V4.3 signed-update allowlist supports JS, PNG and OGG but not secrets',()=>{
 for(const p of ['src/community-suite.js','src/voice-audio.js','assets/banners/novora-panel-factions.png','assets/emojis/nv_faction.png','assets/audio/waiting-music.ogg'])assert.equal(safePath(p),true,p);
 for(const p of ['.env','data/state.json','node_modules/discord.js/x.js','src/updater.js','src/supervisor.js','src/version.js','assets/../../data/state.json','assets/banners/evil.js','package.json'])assert.equal(safePath(p),false,p);
});
test('V4.3 signed-update remote URLs stay under pinned release path',()=>{
 for(const u of ['/novora-releases/src.js.txt','/novora-releases/assets/nv_faction.png','/novora-releases/audio/waiting-music.ogg'])assert.equal(validReleaseUrl(u),true,u);
 for(const u of ['https://attacker.invalid/release.png','/novora-releases/../data/state.txt','/novora-releases/%2e%2e/state.txt','/novora-releases/emoji.gif','//attacker.invalid/bad.png'])assert.equal(validReleaseUrl(u),false,u);
});
test('V4.3 update format validation rejects renamed or corrupt images/audio',()=>{
 const base=path.resolve(__dirname,'../assets');
 checkFileFormat('assets/banners/novora-panel-factions.png',fs.readFileSync(path.join(base,'banners','novora-panel-factions.png')));
 checkFileFormat('assets/audio/waiting-music.ogg',fs.readFileSync(path.join(base,'audio','waiting-music.ogg')));
 assert.throws(()=>checkFileFormat('assets/banners/novora-panel-factions.png',Buffer.from('malware')),/PNG/);
 assert.throws(()=>checkFileFormat('assets/audio/waiting-music.ogg',Buffer.from('bad audio')),/OGG/);
});
test('V4.3 updater rejects modified asset listings without private Ed25519 key',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'fixtures/latest.json')));
 const attempt={...manifest,files:[{...manifest.files[0],path:'assets/emojis/nv_faction.png'}]};
 assert.throws(()=>validateManifest(attempt),/Signatur/);
});
