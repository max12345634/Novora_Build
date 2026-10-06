const { EmbedBuilder } = require('discord.js');
const { getGuildSettings } = require('./guildSettings');
const { logger } = require('./logger');

async function sendLog(guild, title, description, channelOverride = null) {
  try {
    const settings = (await getGuildSettings(guild.id)).logs;
    const channelId = channelOverride || settings?.channelId;
    if ((!settings?.enabled && !channelOverride) || !channelId) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(String(title).slice(0, 256))
        .setDescription(String(description || 'Keine weiteren Details.').slice(0, 4000))
        .setTimestamp()],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    logger.warn('Serverereignis konnte nicht protokolliert werden.', error);
  }
}

module.exports = { sendLog };
