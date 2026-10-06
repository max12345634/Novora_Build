const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Prueft, ob Novora antwortet.'),
  async execute(interaction) {
    const ping = Math.round(interaction.client.ws.ping);
    await interaction.reply({ content: `Pong. Latenz: ${ping} ms`, ephemeral: true });
  }
};
