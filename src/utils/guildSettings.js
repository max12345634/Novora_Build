const fs = require('node:fs/promises');
const path = require('node:path');

const settingsPath = path.join(process.cwd(), 'data', 'guild-settings.json');

async function readAllSettings() {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function writeAllSettings(settings) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(settings, null, 2));
  await fs.rename(tempPath, settingsPath);
}

async function getGuildSettings(guildId) {
  const settings = await readAllSettings();
  return settings[guildId] || {};
}

async function updateGuildSettings(guildId, update) {
  const settings = await readAllSettings();
  settings[guildId] = {
    ...(settings[guildId] || {}),
    ...update
  };
  await writeAllSettings(settings);
  return settings[guildId];
}

module.exports = { getGuildSettings, updateGuildSettings };
