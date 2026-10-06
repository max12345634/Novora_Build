const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Zeigt den aktuellen Novora Bot Status.'),
  async execute(interaction) {
    await interaction.reply({
      content: 'Novora ist online. Systeme werden Schritt fuer Schritt aufgebaut.',
      ephemeral: true
    });
  }
};
