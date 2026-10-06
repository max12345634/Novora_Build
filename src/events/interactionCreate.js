const { Events } = require('discord.js');
const { handleVerifyButton, handleVerifySelect } = require('../features/verify');
const { handleOrderInteraction } = require('../features/orders');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (interaction.isButton() && await handleVerifyButton(interaction)) return;
      if (interaction.isStringSelectMenu() && await handleVerifySelect(interaction)) return;
      if (await handleOrderInteraction(interaction, process.env.GUILD_ID)) return;
      if (!interaction.isChatInputCommand()) return;

      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        await interaction.reply({ content: 'Dieser Command ist noch nicht geladen.', ephemeral: true });
        return;
      }
      await command.execute(interaction);
    } catch (error) {
      logger.error('Fehler bei einer Interaktion.', error);
      const response = { content: 'Da ist ein Fehler passiert. Bitte spaeter erneut versuchen.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(response);
      else await interaction.reply(response);
    }
  }
};
