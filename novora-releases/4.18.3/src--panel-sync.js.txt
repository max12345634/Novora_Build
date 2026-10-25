'use strict';
const {isV2Message}=require('./message-flags');
// Synchronise only existing, bot-owned panel messages. Legacy embed migration
// must never remove the old message before the new ID is durably persisted.
async function refreshSavedPanel({guild,channelId,messageId,makePayload,onReplaced,logger=console}){
  if(!channelId||!messageId)return {status:'skipped',reason:'Noch kein Panel veröffentlicht'};
  const channel=await guild.channels.fetch(channelId).catch(()=>null);
  if(!channel?.messages?.fetch)return {status:'failed',reason:'Panelkanal fehlt oder ist nicht lesbar'};
  const old=await channel.messages.fetch(messageId).catch(()=>null);
  if(!old)return {status:'failed',reason:'Gespeicherte Panelnachricht fehlt. Nicht automatisch neu erstellt.'};
  // A stale/corrupt stored message ID must never edit or delete another user's
  // message, even if the bot has Manage Messages permissions.
  const botId=guild.client?.user?.id;
  if(!botId)return {status:'failed',reason:'Bot-Identität konnte nicht überprüft werden. Keine Änderung vorgenommen.'};
  if(old.author?.id!==botId)return {status:'failed',reason:'Gespeicherte Nachricht stammt nicht von diesem Bot. Keine Änderung vorgenommen.'};
  let payload;
  try{payload=await makePayload(old);}
  catch(err){return {status:'failed',reason:'Panel konnte nicht erstellt werden: '+String(err.message).slice(0,120)};}
  if(!payload?.components?.length)return {status:'failed',reason:'Ungültige Komponenten der aktualisierten Karte'};
  if(isV2Message(old)&&!old.embeds?.length){
    try{await old.edit(payload);return {status:'updated',id:old.id};}
    catch(err){return {status:'failed',reason:'Bearbeiten fehlgeschlagen: '+String(err.message).slice(0,140)};}
  }
  // A legacy embed needs a new V2 message. Without a persistence callback a
  // replacement would be untracked after restart; refuse the migration.
  if(typeof onReplaced!=='function')return {status:'failed',reason:'Keine Speicherung für die neue Panel-ID vorhanden'};
  let created;
  try{created=await channel.send(payload);}
  catch(err){return {status:'failed',reason:'V2-Umstellung fehlgeschlagen: '+String(err.message).slice(0,140)};}
  if(!created?.id){
    let removed=false;
    try{if(created?.delete){await created.delete();removed=true;}}
    catch(err){logger.warn('Panel ohne ID konnte nicht aufgeräumt werden:',String(err.message||err));}
    return {status:'failed',reason:removed
      ?'Discord hat keine neue Panel-ID zurückgegeben; Ersatznachricht entfernt'
      :'Discord hat keine neue Panel-ID zurückgegeben; bitte Kanal auf zusätzliche Nachricht prüfen'};
  }
  // First commit the replacement ID, then delete the old panel. Otherwise a
  // failed database write would leave a new orphan panel and a lost old one.
  try{await onReplaced(created.id);}
  catch(err){
    logger.error('Panel-ID konnte nicht gespeichert werden:',err);
    let restored=false;
    try{await onReplaced(old.id);restored=true;}
    catch(restoreErr){logger.error('Alte Panel-ID konnte nicht wiederhergestellt werden:',restoreErr);}
    if(restored){
      try{await created.delete();}
      catch(cleanup){logger.warn('V2 Panel-Rollback fehlgeschlagen:',String(cleanup.message||cleanup));}
    }
    return {status:'failed',reason:restored?'Neue Panel-ID konnte nicht gespeichert werden; altes Panel bleibt bestehen':'Panel-ID-Speicherung und Wiederherstellung fehlgeschlagen; manuelle Prüfung erforderlich'};
  }
  try{await old.delete();}
  catch(err){
    // Keep the replacement if restoring the old ID fails: otherwise the
    // persisted pointer might refer to a message we just deleted.
    let restored=false;
    try{await onReplaced(old.id);restored=true;}
    catch(restoreErr){logger.error('Panel-ID-Rollback fehlgeschlagen:',restoreErr);}
    if(restored){
      try{await created.delete();}
      catch(cleanup){logger.warn('V2 Panel-Rollback fehlgeschlagen:',String(cleanup.message||cleanup));}
    }
    return {status:'failed',reason:restored?'Altes Panel konnte nicht gelöscht werden; alte Panel-ID wiederhergestellt':'Altes Panel konnte nicht gelöscht werden; neue Panel-ID bleibt gespeichert, bitte Doppelung prüfen'};
  }
  return {status:'updated',id:created.id,migrated:true};
}
function summarizePanels(entries){
 const result={updated:0,skipped:0,failed:0,lines:[]};
 for(const [label,item] of entries){
  if(item.status==='updated')result.updated++;
  else if(item.status==='skipped')result.skipped++;
  else result.failed++;
  const kind=item.status==='updated'?(item.migrated?'V2 ersetzt':'Aktualisiert'):item.status==='skipped'?'Noch nicht veröffentlicht':'Fehler';
  result.lines.push('**'+label+':** '+kind+(item.reason?' – '+item.reason:''));
 }
 return result;
}
module.exports={refreshSavedPanel,summarizePanels};
