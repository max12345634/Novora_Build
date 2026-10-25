'use strict';
const { setTimeout: sleep } = require('node:timers/promises');
function makeApi(url, ownerId, token) {
  if (!/^https:\/\//.test(url)) throw new Error('WEBSITE_URL must be HTTPS');
  async function call(route, method = 'POST', payload, retries = 1) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const separator = route.includes('?') ? '&' : '?';
    const full = url.replace(/\/$/, '') + route + separator + 'ownerId=' + encodeURIComponent(ownerId);
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(full, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
        const raw = await response.text();
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch {}
        if (!response.ok) {
          const hint = response.status === 403 ? 'Zugriff durch Website oder Webhosting blockiert; API-Verbindung prüfen' : 'API unavailable';
          throw new Error(`Website HTTP ${response.status}: ${body.message || body.error || hint}`);
        }
        return body;
      } catch (err) {
        if (i >= retries || /HTTP 4\d\d/.test(err.message)) throw err;
        await sleep(1600);
      }
    }
  }
  return {
    sync(guilds, members) { return call('/api/bot/sync', 'POST', { ownerId, guilds, members }); },
    jobs() { return call('/api/bot/jobs', 'GET'); },
    result(jobId, results) { return call('/api/bot/job-result', 'POST', { ownerId, jobId, results }); }
  };
}
module.exports = { makeApi };
