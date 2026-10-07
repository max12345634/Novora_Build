const {
  PermissionFlagsBits,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

async function attachmentToDataUri(attachment, label) {
  if (!attachment) return undefined;

  const contentType = attachment.contentType?.split(';')[0]?.toLowerCase();
  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`${label} muss PNG, JPG, WEBP oder GIF sein.`);
  }

  if (attachment.size > MAX_IMAGE_BYTES) {
    throw new Error(`${label} darf maximal 10 MB gross sein.`);
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`${label} konnte nicht von Discord geladen werden.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`${label} darf maximal 10 MB gross sein.`);
  }

  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function makeResetBody(scope) {
  if (scope === 'name') return { nick: null };
  if (scope === 'avatar') return { avatar: null };
  if (scope === 'banner') return { banner: null };
  if (scope === 'bio') return { bio: null };

  return {
    nick: null,
    avatar: null,
    banner: null,
    bio: null
  };
}

function friendlyApiError(error) {
  const code = error?.rawError?.code ?? error?.code;

  if (code === 50013) {
    return 'Mir fehlen Discord-Berechtigungen. Fuer den Server-Namen braucht der Bot unter anderem `Nickname aendern`.';
  }

  if (code === 50035) {
    return 'Discord hat mindestens einen Wert abgelehnt. Pruefe Bildformat, Bildgroesse sowie die Laenge von Name und Bio.';
  }

  if (error?.message) return error.message;
  return 'Das Server-Branding konnte nicht gespeichert werden.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('branding')
    .setDescription('Passt das Novora-Botprofil nur fuer diesen Server an.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('einstellen')
        .setDescription('Setzt Name, Profilbild, Banner oder Bio fuer diesen Server.')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Server-spezifischer Name des Bots.')
            .setMinLength(1)
            .setMaxLength(32)
        )
        .addAttachmentOption((option) =>
          option
            .setName('profilbild')
            .setDescription('Server-spezifisches Profilbild als PNG, JPG, WEBP oder GIF.')
        )
        .addAttachmentOption((option) =>
          option
            .setName('banner')
            .setDescription('Server-spezifischer Banner als PNG, JPG, WEBP oder GIF.')
        )
        .addStringOption((option) =>
          option
            .setName('bio')
            .setDescription('Server-spezifische Bio des Bots.')
            .setMaxLength(190)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('zuruecksetzen')
        .setDescription('Setzt einen Teil des Server-Brandings auf das globale Botprofil zurueck.')
        .addStringOption((option) =>
          option
            .setName('bereich')
            .setDescription('Welcher Teil soll zurueckgesetzt werden?')
            .setRequired(true)
            .addChoices(
              { name: 'Name', value: 'name' },
              { name: 'Profilbild', value: 'avatar' },
              { name: 'Banner', value: 'banner' },
              { name: 'Bio', value: 'bio' },
              { name: 'Alles', value: 'all' }
            )
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Dieser Command funktioniert nur auf einem Discord-Server.',
        ephemeral: true
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: 'Du brauchst die Berechtigung `Server verwalten`, um das Bot-Branding zu aendern.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    try {
      let body;

      if (subcommand === 'zuruecksetzen') {
        const scope = interaction.options.getString('bereich', true);
        body = makeResetBody(scope);
      } else {
        const name = interaction.options.getString('name');
        const avatar = interaction.options.getAttachment('profilbild');
        const banner = interaction.options.getAttachment('banner');
        const bio = interaction.options.getString('bio');

        if (!name && !avatar && !banner && bio === null) {
          await interaction.editReply('Gib mindestens einen Wert an: Name, Profilbild, Banner oder Bio.');
          return;
        }

        body = {};

        if (name !== null) body.nick = name;
        if (bio !== null) body.bio = bio;
        if (avatar) body.avatar = await attachmentToDataUri(avatar, 'Das Profilbild');
        if (banner) body.banner = await attachmentToDataUri(banner, 'Der Banner');
      }

      await interaction.client.rest.patch(
        Routes.guildMember(interaction.guildId, '@me'),
        { body }
      );

      if (subcommand === 'zuruecksetzen') {
        const scope = interaction.options.getString('bereich', true);
        const label = scope === 'all' ? 'Das komplette Server-Branding' : 'Der ausgewaehlte Branding-Bereich';
        await interaction.editReply(`${label} wurde zurueckgesetzt.`);
        return;
      }

      const changed = [];
      if (Object.hasOwn(body, 'nick')) changed.push('Name');
      if (Object.hasOwn(body, 'avatar')) changed.push('Profilbild');
      if (Object.hasOwn(body, 'banner')) changed.push('Banner');
      if (Object.hasOwn(body, 'bio')) changed.push('Bio');

      await interaction.editReply(
        `Server-Branding aktualisiert: **${changed.join(', ')}**. Die Aenderung gilt nur auf diesem Server.`
      );
    } catch (error) {
      await interaction.editReply('Branding konnte nicht aktualisiert werden: ' + friendlyApiError(error));
    }
  }
};
