// Viele Servertypen teilen wenige gepflegte Preset-Familien und kombinierbare Themen.
const TYPES = {
  community: 'Community,Allgemeine Community,Freundeskreis,Freizeit,Forum,Social Club,Fandom,Anime,Manga,K-Pop,Musik,Podcast,Buchclub,Filmclub,Fotografie,Kunst,Design,Reisen,Kochen,Sport,Fitness',
  gaming: 'Gaming,Multigaming,Esports,Clan,Gilde,Minecraft,Minecraft Survival,Minecraft Creative,Minecraft Skyblock,Minecraft Bedwars,Roblox,Roblox Roleplay,FiveM,GTA Roleplay,GTA Online,Fortnite,Valorant,League of Legends,Counter-Strike,Overwatch,ARK,Rust,Terraria,Palworld,World of Warcraft,Final Fantasy XIV,Steam Community,Game Server',
  roleplay: 'Roleplay,Text Roleplay,Fantasy RP,Polizei,Feuerwehr,Rettungsdienst,Fraktion,Behörden,Notruf RP,Stadt RP,MilSim,Arma,RedM,Star Wars RP',
  development: 'Development,Software,Open Source,Game Development,Discord Bot,API,SaaS,Technik,IT Support,Hosting,Webentwicklung,Mobile App,Startup,Projekt,Produktentwicklung',
  shop: 'Shop,E-Commerce,Marktplatz,Merchandise,Digitale Produkte,Kundenservice,Bestellungen,Abonnements,Agentur,Unternehmen,Verein',
  creator: 'Creator,YouTube,Twitch,Streaming,Influencer,Content Creator,Social Media,Newsletter,Artist,Musiker,Events,Community Event',
  education: 'Schule,Universität,Lerngruppe,Nachhilfe,Kurs,Akademie,Bootcamp,Forschung,Studierendenprojekt',
  applications: 'Bewerbungsserver,Team Recruiting,Fraktionsbewerbungen,Partnerschaften,Volunteer,Organisation'
};
const SERVER_TYPES = Object.entries(TYPES).flatMap(([family, csv]) => csv.split(',').map((name) => ({ id: name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, family })));
const QUESTIONS = {
  support: [{ id: 'issue', label: 'Wobei brauchst du Hilfe?', style: 'paragraph' }],
  report: [{ id: 'who', label: 'Wen möchtest du melden?' }, { id: 'what', label: 'Was ist passiert?', style: 'paragraph' }, { id: 'proof', label: 'Beweise oder Links (optional)', required: false }],
  bug: [{ id: 'bug', label: 'Beschreibe den Fehler', style: 'paragraph' }, { id: 'steps', label: 'Wie lässt er sich reproduzieren?', style: 'paragraph' }],
  order: [{ id: 'order', label: 'Bestellnummer (optional)', required: false }, { id: 'issue', label: 'Was ist dein Anliegen?', style: 'paragraph' }]
};
const CATALOG = {
  support: ['🆘', 'Allgemeiner Support', 'Fragen und Anliegen zu dieser Community.', 'support'],
  report: ['🚨', 'Mitglied melden', 'Melde einen Vorfall vertraulich.', 'report'],
  bug: ['🐛', 'Fehler melden', 'Beschreibe einen technischen Fehler.', 'bug'],
  ban: ['🔓', 'Entbannungsantrag', 'Bitte um Überprüfung einer Sperre.', 'support'],
  team: ['👥', 'Team-Anliegen', 'Vertrauliche Anliegen zum Team.', 'support'],
  tech: ['⚙️', 'Technischer Support', 'Hilfe bei technischen Problemen.', 'bug'],
  rules: ['📖', 'Regeln und Ablauf', 'Fragen zu Regeln und Abläufen.', 'support'],
  faction: ['🏛️', 'Gruppen-Anliegen', 'Fragen zu Gruppen und Organisationen.', 'support'],
  feature: ['💡', 'Funktionswunsch', 'Schlage eine Verbesserung vor.', 'support'],
  api: ['🔌', 'API-Hilfe', 'Unterstützung bei der Anbindung.', 'bug'],
  account: ['🔐', 'Accountproblem', 'Hilfe mit dem Konto.', 'support'],
  purchase: ['🛒', 'Bestellung', 'Fragen zu einer Bestellung.', 'order'],
  payment: ['💳', 'Zahlung', 'Unterstützung bei einer Zahlung.', 'order'],
  refund: ['↩️', 'Rückerstattung', 'Anfrage zu einer Rückgabe.', 'order'],
  product: ['📦', 'Produkt-Support', 'Hilfe zu einem Produkt.', 'support'],
  partner: ['🤝', 'Partnerschaft', 'Kooperationen und Kontakte.', 'support'],
  application: ['📝', 'Bewerbung', 'Fragen zur Bewerbung.', 'support'],
  event: ['🎉', 'Event-Anliegen', 'Fragen zu Veranstaltungen.', 'support']
};
const FAMILY_CATEGORIES = {
  community: ['support', 'report', 'team', 'event'], gaming: ['support', 'report', 'bug', 'ban', 'team'],
  roleplay: ['support', 'report', 'rules', 'ban', 'faction', 'tech'],
  development: ['tech', 'bug', 'feature', 'api', 'account'], shop: ['purchase', 'payment', 'refund', 'product', 'support'],
  creator: ['support', 'partner', 'report', 'event'], education: ['support', 'tech', 'application', 'report'],
  applications: ['application', 'support', 'tech']
};
function suggest(typeId, description = '') {
  const type = SERVER_TYPES.find((item) => item.id === typeId);
  const text = `${type?.name || ''} ${description}`.toLowerCase();
  const family = type?.family || (/(shop|kauf|bestell|zahlung)/.test(text) ? 'shop' : /(entwick|api|software|bot|hosting)/.test(text) ? 'development' : /(minecraft|roblox|fivem|gaming|spieler)/.test(text) ? 'gaming' : 'community');
  const keys = [...FAMILY_CATEGORIES[family]];
  if (/(shop|kauf|bestell)/.test(text) && !keys.includes('purchase')) keys.push('purchase');
  if (/(polizei|feuerwehr|rettungsdienst|fraktion)/.test(text) && !keys.includes('faction')) keys.push('faction');
  if (/(bewerb|recruit)/.test(text) && !keys.includes('application')) keys.push('application');
  return keys.map((id) => {
    const [emoji, name, descriptionText, form] = CATALOG[id];
    return { id, name, emoji, description: descriptionText, prefix: id, enabled: true, questions: QUESTIONS[form].map((q) => ({ ...q })) };
  });
}
module.exports = { SERVER_TYPES, CATALOG, QUESTIONS, suggest };
