const { randomUUID } = require('node:crypto');

const TYPES = new Map([
  ['image/png', { extension: 'png', signature: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['image/jpeg', { extension: 'jpg', signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ['image/webp', { extension: 'webp', signature: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' }],
  ['image/gif', { extension: 'gif', signature: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) }]
]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

async function resolveImageAttachments(interaction, names) {
  const files = [], sources = {};
  for (const optionName of names) {
    const attachment = interaction.options.getAttachment(optionName);
    if (!attachment) continue;
    const contentType = attachment.contentType?.split(';')[0]?.toLowerCase();
    const type = TYPES.get(contentType);
    const limit = Math.min(Number(interaction.attachmentSizeLimit) || 20 * 1024 * 1024, MAX_IMAGE_BYTES);
    if (!type || attachment.size > limit) throw new Error(`${optionName} muss PNG, JPG, WEBP oder GIF sein und höchstens 15 MB groß sein.`);
    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${optionName} konnte nicht aus Discord geladen werden. Bitte wähle das Bild erneut aus.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > limit || !type.signature(buffer)) throw new Error(`${optionName} ist kein gültiges Bild oder ist größer als 15 MB.`);
    const fileName = `novora-${optionName}-${randomUUID()}.${type.extension}`;
    files.push({ attachment: buffer, name: fileName });
    sources[optionName] = `attachment://${fileName}`;
  }
  return { files, sources };
}

module.exports = { MAX_IMAGE_BYTES, resolveImageAttachments };
