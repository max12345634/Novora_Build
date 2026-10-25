'use strict';
// One or two high-value required questions per category. Evidence is uploaded inside the private ticket.
// Keep legacy IDs for compatibility with already stored V4.2 / V4.3 tickets.
const QUESTIONS=Object.freeze({
 question:{name:'Allgemeiner Support',icon:'nv_support',color:0x6573DC,fields:[
  ['title','Wobei brauchst du Hilfe?','short',true,150],
  ['description','Beschreibe kurz dein Anliegen','paragraph',true,1500]],
  guidance:'Problem klären, Rückfragen im privaten Ticket stellen und eine hilfreiche Lösung dokumentieren.'},
 rules:{name:'Regel- & RP-Fragen',icon:'nv_rules',color:0x617AC8,fields:[
  ['title','Welche Regel oder RP-Situation?','short',true,150],
  ['description','Was ist genau unklar?','paragraph',true,1500]],
  guidance:'Konkrete Regel sachlich erklären, mögliche Regelwerksänderungen an das zuständige Team geben.'},
 player:{name:'Spieler melden',icon:'nv_report',color:0xD18B50,fields:[
  ['title','Welchen Spieler meldest du?','short',true,150],
  ['description','Was ist passiert und wann?','paragraph',true,1700]],
  guidance:'Meldung unparteiisch überprüfen. Screenshots/Videos im privaten Ticket anfordern; keine automatische Sanktion.'},
 technical:{name:'Technischer Support',icon:'nv_technical',color:0x5F88A5,fields:[
  ['title','Was funktioniert nicht?','short',true,150],
  ['description','Fehlerbeschreibung (Gerät optional)','paragraph',true,1700]],
  guidance:'Fehler reproduzieren, technische Ursache eingrenzen; niemals Login-Daten oder Tokens verlangen.'},
 report:{name:'Team-Beschwerde',icon:'nv_team',color:0xBD6883,fields:[
  ['title','Wen betrifft die Beschwerde?','short',true,150],
  ['description','Beschreibe den Vorfall','paragraph',true,1700]],
  guidance:'Vertrauliche Bearbeitung nur im Beschwerdeteam, Interessenkonflikte beachten, keine Weiterleitung an Beschuldigte.'}
});
function fieldsFor(kind){if(!QUESTIONS[kind])throw Error('Unbekannte Support-Kategorie');return QUESTIONS[kind].fields;}
function normalizeSubmission(kind,values){const out={};for(const [id,label,,required,max] of fieldsFor(kind)){
 const raw=String(values?.[id]||'').replace(/[\u0000-\u001f]/g,' ').replace(/@everyone|@here/gi,'[Erwähnung]').trim();
 if(required&&!raw)throw Error('Bitte beantworte: '+label);out[id]=raw.slice(0,max);
 }return out;}
module.exports={QUESTIONS,fieldsFor,normalizeSubmission};
