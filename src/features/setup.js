const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder
} = require('discord.js');
const { getGuildSettings, updateGuildSettings } = require('../utils/guildSettings');
const { sendTicketPanel } = require('./tickets');

const IDS = {
  menu: 'setup:menu', channel: 'setup:tickets:channel', role: 'setup:tickets:role',
  category: 'setup:tickets:category', log: 'setup:tickets:log', finish: 'setup:tickets:finish'
};

function baseEmbed(guild) {
  return new EmbedBuilder().setColor(0x5865f2).setTitle('⚙️ Novora Setup')
    .setDescription('Richte die wichtigsten Novora-Systeme zentral ein. Wähle unten aus, was du konfigurieren möchtest.')
    .addFields(
      { name: '🎫 Tickets', value: 'Support-Tickets mit Kategorien, Formular, Übernahme und Logs.' },
      { name: '✅ Verify', value: 'Verifizierung und Mitgliedsrolle.', inline: true },
      { name: '👋 Welcome / Leave', value: 'Begrüßung und Verabschiedung.', inline: true },
      { name: '📋 Logs', value: 'Server- und Novora-Protokolle.', inline: true },
      { name: '📝 Bewerbungen', value: 'Bewerbungs-System.', inline: true },
      { name: '🎨 Branding', value: 'Server-spezifisches Novora-Profil.', inline: true }
    ).setFooter({ text: guild.name + ' · Novora Build' });
}
function setupMenu() {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(IDS.menu)
    .setPlaceholder('System auswählen …').addOptions(
      { label: 'Tickets', value: 'tickets', emoji: '🎫', description: 'Support-Tickets einrichten' },
      { label: 'Verify', value: 'verify', emoji: '✅', description: 'Verifizierung einrichten' },
      { label: 'Welcome / Leave', value: 'welcome', emoji: '👋', description: 'Mitgliedsnachrichten einrichten' },
      { label: 'Logs', value: 'logs', emoji: '📋', description: 'Logging einrichten' },
      { label: 'Bewerbungen', value: 'applications', emoji: '📝', description: 'Bewerbungen einrichten' },
      { label: 'Branding', value: 'branding', emoji: '🎨', description: 'Bot-Profil anpassen' }
    ));
}
function ticketWizard(config = {}) {
  const summary = [
    'Panel: ' + (config.panelChannelId ? '<#' + config.panelChannelId + '>' : '❌ fehlt'),
    'Supportrolle: ' + (config.teamRoleId ? '<@&' + config.teamRoleId + '>' : '❌ fehlt'),
    'Ticket-Kategorie: ' + (config.categoryId ? '<#' + config.categoryId + '>' : 'keine'),
    'Logkanal: ' + (config.logChannelId ? '<#' + config.logChannelId + '>' : 'keiner')
  ].join('\n');
  return {
    embeds: [new EmbedBuilder().setColor(0xf0b232).setTitle('🎫 Ticket-System einrichten')
      .setDescription('Wähle Panel-Kanal und Supportrolle. Kategorie und Logkanal sind optional.\n\n' + summary)
      .setFooter({ text: 'Novora Build · Ticket Setup' })],
    components: [
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.channel).setPlaceholder('📨 Panel-Kanal wählen').addChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)),
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(IDS.role).setPlaceholder('👥 Supportrolle wählen').setMinValues(1).setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.category).setPlaceholder('📁 Ticket-Kategorie wählen (optional)').addChannelTypes(ChannelType.GuildCategory).setMinValues(0).setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(IDS.log).setPlaceholder('📋 Logkanal wählen (optional)').addChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(IDS.finish).setLabel('Ticket-System aktivieren').setEmoji('✅').setStyle(ButtonStyle.Success))
    ]
  };
}
async function saveTicketField(interaction, key, value) {
  const current = await getGuildSettings(interaction.guildId);
  const tickets = { ...(current.tickets || {}), [key]: value };
  await updateGuildSettings(interaction.guildId, { tickets });
  await interaction.update(ticketWizard(tickets));
}
async function handleSetupInteraction(interaction) {
  if (!interaction.inGuild() || !interaction.customId?.startsWith('setup:')) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'Du brauchst **Server verwalten**, um Novora einzurichten.', ephemeral: true });
    return true;
  }
  if (interaction.isStringSelectMenu() && interaction.customId === IDS.menu) {
    const choice = interaction.values[0];
    if (choice === 'tickets') {
      const settings = await getGuildSettings(interaction.guildId);
      await interaction.update(ticketWizard(settings.tickets || {}));
      return true;
    }
    const hints = {
      verify: 'Verify wird als nächstes in den neuen Assistenten übernommen.',
      welcome: 'Welcome / Leave wird als nächstes in den neuen Assistenten übernommen.',
      logs: 'Die Log-Profile Basis / Erweitert / Alles werden als nächstes ergänzt.',
      applications: 'Das Bewerbungs-System wird als nächstes ergänzt.',
      branding: 'Branding ist aktuell bereits über **/branding** verfügbar.'
    };
    await interaction.reply({ content: hints[choice] || 'Dieser Bereich wird vorbereitet.', ephemeral: true });
    return true;
  }
  if (interaction.isChannelSelectMenu() && interaction.customId === IDS.channel) return saveTicketField(interaction, 'panelChannelId', interaction.values[0]);
  if (interaction.isRoleSelectMenu() && interaction.customId === IDS.role) {
    const roleId = interaction.values[0];
    if (roleId === interaction.guild.roles.everyone.id) {
      await interaction.reply({ content: '@everyone kann nicht als Supportrolle verwendet werden.', ephemeral: true });
      return true;
    }
    return saveTicketField(interaction, 'teamRoleId', roleId);
  }
  if (interaction.isChannelSelectMenu() && interaction.customId === IDS.category) return saveTicketField(interaction, 'categoryId', interaction.values[0] || null);
  if (interaction.isChannelSelectMenu() && interaction.customId === IDS.log) return saveTicketField(interaction, 'logChannelId', interaction.values[0] || null);
  if (interaction.isButton() && interaction.customId === IDS.finish) {
    const settings = await getGuildSettings(interaction.guildId);
    const config = settings.tickets || {};
    if (!config.panelChannelId || !config.teamRoleId) {
      await interaction.reply({ content: 'Bitte wähle zuerst **Panel-Kanal** und **Supportrolle**.', ephemeral: true });
      return true;
    }
    const panel = await interaction.guild.channels.fetch(config.panelChannelId).catch(() => null);
    if (!panel?.isTextBased()) {
      await interaction.reply({ content: 'Der gewählte Panel-Kanal existiert nicht mehr.', ephemeral: true });
      return true;
    }
    await updateGuildSettings(interaction.guildId, { tickets: { ...config, enabled: true } });
    await sendTicketPanel(panel, interaction.guild);
    await interaction.update({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅ Ticket-System ist aktiv')
        .setDescription('Das Ticket-Panel wurde in ' + panel.toString() + ' erstellt.').setFooter({ text: 'Novora Build' })],
      components: [setupMenu()]
    });
    return true;
  }
  return false;
}
module.exports = { baseEmbed, setupMenu, handleSetupInteraction, ticketWizard };
