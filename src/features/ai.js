const { getGuildSettings } = require('../utils/guildSettings');
const { suggest } = require('./presets');
const { logger } = require('../utils/logger');
// Deterministic fallback: only explicitly configured facts may become factual answers.
function fallback(settings, question) {
  const ai = settings.ai || {}, q = question.toLowerCase();
  const match = (ai.faq || []).find(item => item.q && (q.includes(item.q.toLowerCase()) || item.q.toLowerCase().includes(q)));
  if (match) return match.a;
  if (/(bewerb)/.test(q) && settings.applications?.enabled) return 'Bewerbungen sind auf diesem Server aktiviert. Schau nach dem Bewerbungs-Panel oder frage das Team nach dem Kanal.';
  if (/(verifiz|verify)/.test(q) && settings.verify?.enabled && settings.verify.channelId) return `Starte die Verifizierung in <#${settings.verify.channelId}>.`;
  if (/(regel|faq|link)/.test(q) && ai.links?.length) return `Hinterlegte Links:\n${ai.links.slice(0, 4).join('\n')}`;
  return 'Dazu habe ich in der Wissensbasis dieses Servers keine sichere Antwort. Ein Teammitglied kann dir weiterhelfen.';
}
function sensitive(question) { return /(beschwerde|entbann|ban|beweis|strafe|teammitglied|moderation|rueckerstattung|rückerstatt|zahlung)/i.test(question); }
async function provider(settings, question, context = '') {
  const endpoint = process.env.NOVORA_AI_ENDPOINT, key = process.env.NOVORA_AI_API_KEY;
  if (!endpoint || !key) return null;
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('KI-Endpunkt muss HTTPS verwenden.');
  const ai = settings.ai || {};
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000), body: JSON.stringify({ model: process.env.NOVORA_AI_MODEL || 'default', temperature: 0.2,
      messages: [{ role: 'system', content: `Du bist Novora. Antworte nur mit gesichertem Wissen dieses Servers. Erfinde keine Fakten. Wenn unklar: Übergabe an Menschen. Stil: ${ai.style || 'freundlich, knapp'}.
Serverbeschreibung: ${String(ai.description || settings.tickets?.serverDescription || '').slice(0, 1500)}
FAQ: ${JSON.stringify((ai.faq || []).slice(0, 30))}
Links: ${JSON.stringify((ai.links || []).slice(0, 30))}
Ticket-Kontext: ${String(context).slice(0, 2500)}` },
        { role: 'user', content: question.slice(0, 1000) }] }) });
  if (!response.ok) throw new Error(`KI-Provider HTTP ${response.status}`);
  const data = await response.json();
  return String(data.choices?.[0]?.message?.content || '').slice(0, 1800) || null;
}
async function testAnswer(settings, question, context = '') {
  if (sensitive(question)) return 'Dieses Anliegen gehört zum Support-Team. Ich leite es an einen Menschen weiter.';
  if (settings.ai?.enabled) {
    try { return await provider(settings, question, context) || fallback(settings, question); }
    catch (error) { logger.warn('KI-Anfrage fehlgeschlagen; regelbasierter Modus aktiv.', error); }
  }
  return fallback(settings, question);
}
async function assistTicket(message) {
  if (!message.guild || message.author.bot || !message.content || !message.channel?.topic?.startsWith('novora-ticket:')) return;
  const settings = await getGuildSettings(message.guild.id), ai = settings.ai || {};
  if (!ai.enabled || !ai.ticketEnabled || !ai.autoReply) return;
  const ticket = settings.tickets?.records?.[message.channel.id];
  if (!ticket || ticket.state !== 'open' || ticket.requesterId !== message.author.id) return;
  if (sensitive(message.content)) { await message.reply({ content: 'Das sollte ein Teammitglied prüfen. Ich gebe dein Anliegen an den Support weiter.', allowedMentions: { parse: [] } });
    const roleId = settings.tickets?.teamRoleId; if (roleId) await message.channel.send({ content: `<@&${roleId}>`, allowedMentions: { roles: [roleId] } }); return; }
  const context = `Kategorie: ${ticket.categoryName || ticket.categoryId}; Formular: ${JSON.stringify(ticket.answers || {})}`;
  const answer = await testAnswer(settings, message.content, context);
  if (answer.startsWith('Dazu habe ich')) return; // Keine Endlosschleife oder nutzlose Antworten.
  await message.reply({ content: `🤖 ${answer}`, allowedMentions: { parse: [] } });
}
function setupSuggestions(settings) {
  return { categories: suggest(settings.tickets?.serverType, settings.tickets?.serverDescription || settings.ai?.description || ''),
    verify: true, logs: 'basis', applications: /(bewerb|team|polizei|feuerwehr)/i.test(settings.tickets?.serverDescription || '') };
}
module.exports = { fallback, sensitive, testAnswer, assistTicket, setupSuggestions };
