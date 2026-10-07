const { Events } = require('discord.js');
const { assistTicket } = require('../features/ai');
const { logger } = require('../utils/logger');
module.exports = { name: Events.MessageCreate, async execute(message) {
  try { await assistTicket(message); } catch (error) { logger.warn('KI-Ticketantwort fehlgeschlagen.', error); }
} };
