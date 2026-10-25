'use strict';
const id = value => /^\d{15,22}$/.test(String(value || '')) ? String(value) : '';
function normalizeJob(value) {
  if (!value || typeof value !== 'object' || !/^[0-9a-f]{32}$/.test(String(value.id || ''))) return null;
  const guildId = id(value.guildId);
  if (!guildId || !Array.isArray(value.userIds) || value.userIds.length < 1 || value.userIds.length > 20) return null;
  const userIds = value.userIds.map(id);
  if (userIds.some(v => !v) || new Set(userIds).size !== userIds.length) return null;
  return { id: value.id, guildId, userIds };
}
function resultsForWebsite(job, outcome) {
  const completed = new Map((outcome.completed || []).map(item => [String(item.id), item]));
  const failed = new Map((outcome.failed || []).map(item => [String(item.id), item]));
  return job.userIds.map(userId => {
    const good = completed.get(userId);
    const bad = failed.get(userId);
    return {
      userId,
      ok: !!good,
      message: String(good?.status || bad?.error || outcome.error || 'Nicht verarbeitet').slice(0, 240)
    };
  });
}
module.exports = { normalizeJob, resultsForWebsite };
