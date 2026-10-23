#!/usr/bin/env node
'use strict';
// Run only with the Discord bot stopped. Dry-run by default.
const path=require('node:path');
const {recoverPendingUpdate}=require('../src/updater');
const flags=process.argv.slice(2);
const allowed=new Set(['--apply','--i-stopped-bot']);
if(flags.some(flag=>!allowed.has(flag))){
  console.error('Verwendung: node scripts/recover-update.js [--apply --i-stopped-bot]');
  process.exitCode=2;
}else{
  try{
    const apply=flags.includes('--apply');
    const result=recoverPendingUpdate(path.resolve(__dirname,'..'),{
      apply,botStopped:flags.includes('--i-stopped-bot')
    });
    if(!result.pending&&!result.restored)console.log('Kein offenes Update-Journal gefunden. Keine Änderung vorgenommen.');
    else if(result.restored){
      console.log('Wiederherstellung abgeschlossen: '+result.files+' Datei(en).');
      if(!result.backupRemoved)console.warn('Backup konnte nicht gelöscht werden: '+result.backup);
    }else{
      console.log('Wiederherstellung erforderlich: '+result.files+' Datei(en). Backup: '+result.backup);
      console.log('BotHosting-Bot STOPPEN, dann: node scripts/recover-update.js --apply --i-stopped-bot');
    }
  }catch(e){console.error('Wiederherstellung verweigert: '+e.message);process.exitCode=1}
}
