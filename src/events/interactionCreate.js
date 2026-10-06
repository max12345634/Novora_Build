const { Events } = require('discord.js');
const { handleVerifyButton, handleVerifySelect } = require('../features/verify');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (interaction.isButton()) {
        if (await handleVerifyButton(interaction)) {
          return;
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (await handleVerifySelect(interaction)) {
          return;
        }
      }

      if (!interaction.isChatInputCommand()) {
        return;
      }

      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        await interaction.reply({ content: 'Dieser Command ist noch nicht geladen.', ephemeral: true });
        return;
      }

      await command.execute(interaction);
    } catch (error) {
      logger.error('Fehler bei einer Interaktion.', error);

      const response = { content: 'Da ist ein Fehler passiert. Bitte spaeter erneut versuchen.', ephemeral: true };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
  }
};
