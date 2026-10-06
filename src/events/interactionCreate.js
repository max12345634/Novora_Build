const { Events } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({ content: 'Dieser Command ist noch nicht geladen.', ephemeral: true });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Fehler bei /${interaction.commandName}`, error);

      const response = { content: 'Da ist ein Fehler passiert. Bitte spaeter erneut versuchen.', ephemeral: true };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
  }
};
