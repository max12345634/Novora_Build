const { suggest } = require('./presets');
const { DESIGN_BY_ID } = require('./designs');

// Public template code, not a secret or a permission grant. Values are applied as editable drafts.
const TEMPLATE_CODE = '0908';
function templateForCode(code, guildName = 'Dein Server') {
  if (String(code || '').trim() !== TEMPLATE_CODE) return null;
  const description = `Community von ${String(guildName).slice(0, 80)}`;
  return {
    code: TEMPLATE_CODE,
    label: 'Novora Community Start',
    description,
    branding: { projectName: String(guildName).slice(0, 80), ...DESIGN_BY_ID.midnight, footerText: `${guildName} · powered by Novora` },
    tickets: { serverType: 'community', serverDescription: description, categories: suggest('community', description), enabled: false },
    applications: { types: [], enabled: false },
    verify: { enabled: false, title: 'Verifizierung', description: `Verifiziere dich für ${guildName}.` },
    welcome: { enabled: false, title: `Willkommen bei ${guildName}`, description: 'Hallo %MENTION% — schön, dass du da bist!' },
    leave: { enabled: false, title: 'Auf Wiedersehen', description: '%USERNAME% hat den Server verlassen.' },
    logs: { enabled: false, profile: 'basis' },
    ai: { enabled: false, ticketEnabled: false, channelEnabled: false, autoReply: false, channelIds: [], channelId: null,
      description, faq: [], links: [], knowledge: '', style: 'Freundlich, klar und kurz' }
  };
}

function analyzeGuild(guild, settings = {}) {
  const channels = [...guild.channels.cache.values()]
    .filter(channel => channel.viewable)
    .map(channel => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId || null }));
  const roles = [...guild.roles.cache.values()].filter(role => !role.managed && role.name !== '@everyone')
    .map(role => ({ id: role.id, name: role.name }));
  const suggestedSupportRole = roles.find(role => /^(support|support team|supporter|help ?desk|moderator|moderation|team)$/i.test(role.name.trim())) || null;
  const description = String(settings.ai?.description || settings.tickets?.serverDescription || '').slice(0, 1000);
  const type = settings.tickets?.serverType || 'community';
  const categories = settings.tickets?.categories?.length ? settings.tickets.categories : suggest(type, description);
  const recommendations = [
    { key: 'support', name: 'novora-support', label: 'KI-Support-Chat', existingId: channels.find(channel => ['novora-support', 'support-chat'].includes(channel.name.toLowerCase()))?.id || null },
    { key: 'tickets', name: 'novora-tickets', label: 'Ticket-Panel', existingId: channels.find(channel => ['novora-tickets', 'tickets'].includes(channel.name.toLowerCase()))?.id || null },
    { key: 'verify', name: 'novora-verify', label: 'Verifizierung', existingId: channels.find(channel => ['novora-verify', 'verify'].includes(channel.name.toLowerCase()))?.id || null },
    { key: 'applications', name: 'novora-bewerbungen', label: 'Bewerbungen', existingId: channels.find(channel => ['novora-bewerbungen', 'bewerbungen'].includes(channel.name.toLowerCase()))?.id || null },
    { key: 'welcome', name: 'novora-willkommen', label: 'Welcome/Leave', existingId: channels.find(channel => ['novora-willkommen', 'willkommen'].includes(channel.name.toLowerCase()))?.id || null }
  ];
  for (const item of recommendations) item.exists = Boolean(item.existingId);
  return { guildId: guild.id, guildName: guild.name, description, channels, roles, suggestedSupportRole, categories, recommendations,
    channelCount: channels.length, roleCount: roles.length, unreadableChannelsOmitted: true };
}

function draftFromAnalysis(plan, settings = {}) {
  const current = settings;
  const byKey = Object.fromEntries(plan.recommendations.map(item => [item.key, item]));
  const support = byKey.support;
  const tickets = byKey.tickets;
  const verify = byKey.verify;
  const applications = byKey.applications;
  const welcome = byKey.welcome;
  return {
    tickets: { ...current.tickets, serverType: current.tickets?.serverType || 'community',
      serverDescription: plan.description || current.tickets?.serverDescription || `Community von ${plan.guildName}`,
      categories: current.tickets?.categories?.length ? current.tickets.categories : plan.categories,
      teamRoleId: current.tickets?.teamRoleId || plan.suggestedSupportRole?.id || null,
      panelChannelId: tickets?.existingId || current.tickets?.panelChannelId || null, enabled: false },
    verify: { ...current.verify, channelId: verify?.existingId || current.verify?.channelId || null, enabled: false },
    applications: { ...current.applications, channelId: applications?.existingId || current.applications?.channelId || null, enabled: false },
    welcome: { ...current.welcome, channelId: welcome?.existingId || current.welcome?.channelId || null, enabled: false },
    ai: { ...current.ai, description: plan.description || current.ai?.description || '',
      channelIds: support?.existingId ? [support.existingId] : (current.ai?.channelIds || []),
      channelId: support?.existingId || current.ai?.channelId || null,
      teamRoleId: current.ai?.teamRoleId || plan.suggestedSupportRole?.id || null, enabled: current.ai?.enabled || false,
      channelEnabled: false }
  };
}

module.exports = { TEMPLATE_CODE, templateForCode, analyzeGuild, draftFromAnalysis };
