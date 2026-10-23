'use strict';
// Local, deterministic application pre-check; not an LLM or a substitute for human review.
const TIERS=Object.freeze({
  small:Object.freeze({label:'Kleine Partnerschaft',forumTag:'Kleine Partnerschaft',short:'Klein',min:1,max:100,icon:'nv_partner_small'}),
  medium:Object.freeze({label:'Mittlere Partnerschaft',forumTag:'Mittel · Partner',short:'Mittel',min:101,max:699,icon:'nv_partner_medium'}),
  large:Object.freeze({label:'Große Partnerschaft',forumTag:'Große Partnerschaft',short:'Groß',min:700,max:null,icon:'nv_partner_large'})
});
function tierFor(members){
  const n=Number(members);
  if(!Number.isSafeInteger(n)||n<1)return null;
  return n<=100?'small':n<700?'medium':'large';
}
function scorePartnership(form,{inviteVerified=false,applicantNotes=''}={}){
  // Scores QUALITY OF APPLICATION, not trustworthiness or value of a person/community.
  const name=String(form?.server||'').trim();
  const advert=String(form?.advert||'').trim();
  const invite=String(form?.invite||'').trim();
  const extra=String(form?.extra||'').trim();
  const notes=String(applicantNotes||'').slice(0,6000).trim();
  const size=tierFor(form?.members);
  let score=10;const checks=[];const warnings=[];
  const good=(points,text)=>{score+=points;checks.push(text)};
  if(name.length>=3)good(10,'Servername angegeben');else warnings.push('Servername prüfen');
  if(inviteVerified)good(25,'Discord-Einladung erfolgreich geprüft');
  else if(/^https:\/\/(discord\.gg|discord\.com\/invite)\//i.test(invite))good(10,'Discord-Einladung angegeben, noch nicht validiert');
  else warnings.push('Einladungslink fehlt oder ist nicht geprüft');
  if(size)good(10,'Mitgliederzahl angegeben');else warnings.push('Mitgliederzahl fehlt');
  const length=advert.length;
  if(length>=240)good(25,'Ausführliche Servervorstellung');
  else if(length>=100)good(20,'Aussagekräftige Servervorstellung');
  else if(length>=45)good(12,'Kurze Servervorstellung');
  else if(length>=10)good(5,'Sehr kurze Servervorstellung');
  else warnings.push('Serverwerbung fehlt oder ist zu kurz');
  if(/\b(regeln|regelwerk|moderation|team|support|community|roleplay|rp|events|veranstaltungen|konzept|aktiv|aktivität|konzept)\b/i.test(advert))good(10,'Community-Konzept oder Aktivitäten beschrieben');
  else warnings.push('Community-Konzept und Inhalte könnten konkreter sein');
  if(extra.length>=25)good(10,'Zusatzinformationen vorhanden');
  if(notes.length>=80)good(5,'Antragsteller hat im Ticket weitere Informationen ergänzt');
  if(/(?:discord\.gg|discord\.com\/invite)\//gi.test(advert))warnings.push('Einladungslink zusätzlich in der Werbung – bitte auf Aktualität prüfen');
  if(/\b(?:gratis\s+nitro|free\s+nitro|gift\s*drop|100%\s*garantiert|token\s*generator|selbstbot|selfbot)\b/i.test(advert+' '+extra+' '+notes)){
    score-=30;warnings.push('Auffällige Werbeversprechen – manuelle Sicherheitsprüfung empfohlen');
  }
  const repeated=/(.{12,})\1{2,}/iu.test(advert);
  if(repeated){score-=10;warnings.push('Wiederholter Werbetext – bitte Qualität prüfen')}
  score=Math.max(0,Math.min(100,score));
  const level=score>=75?'Gut dokumentiert':score>=50?'Nachfragen sinnvoll':'Unvollständig';
  const next=warnings.length?warningsFirst(warnings):'Angaben durch das Team prüfen';
  return {score,level,tier:size,checks:checks.slice(0,6),warnings:warnings.slice(0,4),recommendation:next,method:'Lokale regelbasierte Vorprüfung – keine generative KI',manualReview:true};
}
function warningsFirst(warnings){return warnings[0]}
function tierCount(records,guildId){
  const result={small:0,medium:0,large:0,active:0};
  for(const entry of Object.values(records||{})){
    if(entry.guildId!==guildId||entry.status!=='active')continue;
    result.active++;
    const tier=entry.tier||tierFor(entry.members);
    if(tier)result[tier]++;
  }
  return result;
}
module.exports={TIERS,tierFor,scorePartnership,tierCount};
