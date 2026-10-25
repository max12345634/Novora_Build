'use strict';
// Read-only, bounded case lookup for the existing authenticated dashboard bridge.
function findCase(snapshot, kind, caseId) {
  if (!['ticket', 'voice'].includes(kind)) throw Error('Ungültiger Falltyp');
  if (typeof caseId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(caseId)) throw Error('Ungültige Fall-ID');
  const entries = snapshot?.[kind === 'ticket' ? 'tickets' : 'voice'];
  if (!Array.isArray(entries)) throw Error('Falldaten nicht verfügbar');
  const match = entries.find(entry => entry && String(entry.id) === caseId);
  if (!match) return {ok:false, found:false};
  return {ok:true, found:true, kind, case:match};
}
module.exports={findCase};
