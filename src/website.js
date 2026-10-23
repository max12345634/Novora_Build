'use strict';
const http = require('node:http');
const { id } = require('./oauth');
const escape = str => String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const wrap = (title, body) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} – Novora Verify</title><style>body{font:15px system-ui;background:#f7f9ff;color:#1a2450;margin:0;display:grid;place-items:center;min-height:100vh}.card{background:white;max-width:480px;width:calc(100% - 60px);border-radius:24px;box-shadow:0 20px 60px #22336616;padding:32px}h1{font-size:26px;margin:14px 0}p{color:#63708a;line-height:1.7}.tag{font-size:12px;letter-spacing:1px;color:#6879cc;font-weight:800}.btn{display:block;border:0;background:#6477ed;color:white;width:100%;box-sizing:border-box;padding:14px;border-radius:12px;cursor:pointer;font:700 14px system-ui;margin-top:15px;text-align:center;text-decoration:none}select{padding:12px;width:100%;box-sizing:border-box;border:1px solid #dce2ef;border-radius:10px}label{display:block;margin:14px 0;font-weight:600;font-size:13px}.success-mark{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#edf7f2;color:#168054;font-weight:800;font-size:28px;margin:22px 0 12px}.success-note{font-size:13px;color:#7b859a;margin-top:26px}small{display:block;color:#8491ad;margin:20px 0 0}</style></head><body><main class="card"><div class="tag">NOVORA VERIFY</div>${body}</main></body></html>`;

const transcriptWrap = (title, body) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} – Novora Transcript</title><style>
:root{color-scheme:dark}body{margin:0;font:15px system-ui;background:#090b10;color:#f5f7fb}.page{max-width:1100px;margin:0 auto;padding:32px 18px 60px}.hero{background:linear-gradient(180deg,#10141d,#0d1117);border:1px solid #1b2432;border-radius:24px;padding:28px 24px;box-shadow:0 25px 80px rgba(0,0,0,.35)}.kicker{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#7dd79d;font-weight:800}.hero h1{margin:10px 0 6px;font-size:clamp(28px,5vw,54px);line-height:1.02}.hero p{color:#a8b2c4;max-width:780px}.meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.pill{background:#121826;border:1px solid #283244;border-radius:999px;padding:9px 12px;color:#d9e1f0;font-size:13px}.card{margin-top:22px;background:#0f141d;border:1px solid #1f2937;border-radius:22px;padding:18px}.message{padding:14px 16px;border-radius:16px;background:#0b1017;border:1px solid #202a38;margin-top:12px}.message .head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:8px}.name{font-weight:700}.time{font-size:12px;color:#90a0b8}.text{white-space:pre-wrap;line-height:1.6;color:#eef3fb}.muted{color:#8da0ba}.empty{padding:20px;color:#9db0c9}</style></head><body><main class="page">${body}</main></body></html>`;
const fmtDate=t=>{try{return new Date(Number(t||0)).toLocaleString('de-DE');}catch{return 'Unbekannt';}};

function startWebsite({ port, publicUrl, websiteUrl, client, oauth, store, bridge, verified }) {
  const server = http.createServer(async (req,res) => {
    const send = (status, html, headers={}) => { res.writeHead(status, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", ...headers }); res.end(html); };
    try {
      const loc = new URL(req.url, publicUrl);
      // Website-to-bot bridge: the site connects to this API, never the other way around.
      if (loc.pathname.startsWith('/api/bridge/')) {
        const sendJson=(status,body)=>{ res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body)); };
        const readJson=async()=>{const parts=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>12000)throw new Error('Anfrage zu groß');parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');};
        if(req.method==='POST'&&loc.pathname==='/api/bridge/pair') {const body=await readJson();const result=bridge.pair(body.code);return sendJson(result.status,result.body);}
        if(!bridge.authorized(req.headers.authorization)) return sendJson(401,{error:'Nicht autorisiert'});
        if(req.method==='GET'&&loc.pathname==='/api/bridge/support'){
          try{return sendJson(200,await bridge.support.snapshot(String(loc.searchParams.get('guildId')||''),String(loc.searchParams.get('adminId')||'')));}
          catch(e){return sendJson(403,{error:String(e.message).slice(0,180)});}
        }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/support/case'){
          try{
            const guildId=String(loc.searchParams.get('guildId')||'');
            const adminId=String(loc.searchParams.get('adminId')||'');
            const result=await bridge.support.findDashboardCase(guildId,adminId,String(loc.searchParams.get('kind')||''),String(loc.searchParams.get('caseId')||''));
            return sendJson(result.found?200:404,result);
          }catch(e){return sendJson(403,{error:String(e.message).slice(0,180)});}
        }
        if(req.method==='POST'&&loc.pathname==='/api/bridge/support/action'){
          const body=await readJson();
          try{return sendJson(200,await bridge.support.dashboardAction(String(body.guildId||''),String(body.adminId||''),String(body.kind||''),String(body.id||''),String(body.action||'')));}
          catch(e){return sendJson(403,{error:String(e.message).slice(0,180)});}
        }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/changelog')
          return sendJson(200,{ok:true,...bridge.changelog()});
        if(req.method==='GET'&&loc.pathname==='/api/bridge/owner-alerts'){
          try{return sendJson(200,await bridge.ownerAlerts.get(String(loc.searchParams.get('guildId')||''),String(loc.searchParams.get('adminId')||'')));}
          catch(e){return sendJson(403,{error:String(e.message).slice(0,200)});}
        }
        if(req.method==='POST'&&loc.pathname==='/api/bridge/owner-alerts'){
          const body=await readJson();
          try{return sendJson(200,await bridge.ownerAlerts.update(String(body.guildId||''),String(body.adminId||''),{action:body.action,category:body.category}));}
          catch(e){return sendJson(403,{error:String(e.message).slice(0,200)});}
        }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/snapshot')return sendJson(200,bridge.snapshot());
        if(req.method==='GET'&&loc.pathname==='/api/bridge/security-logs') {
          const guildId=id(loc.searchParams.get('guildId'));
          const adminId=id(loc.searchParams.get('adminId'));
          if(!guildId||!adminId)return sendJson(400,{error:'Ungültiger Server / Administrator'});
          try{return sendJson(200,{ok:true,...await bridge.security.list(guildId,adminId,{
            level:loc.searchParams.get('level')||undefined,action:loc.searchParams.get('action')||undefined,
            limit:Math.min(100,Number(loc.searchParams.get('limit')||50))
          })});}catch(err){return sendJson(403,{error:String(err.message).slice(0,180)})}
        }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/security-status') {
          const guildId=id(loc.searchParams.get('guildId')),adminId=id(loc.searchParams.get('adminId'));
          if(!guildId||!adminId)return sendJson(400,{error:'Ungültige ID'});
          try{return sendJson(200,await bridge.security.status(guildId,adminId));}
          catch(err){return sendJson(403,{error:String(err.message).slice(0,180)})}
        }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/ops'){
          const r=await bridge.ops.read(String(loc.searchParams.get('guildId')||''),String(loc.searchParams.get('adminId')||''));return sendJson(r.status,r.body);
        }
        if(req.method==='POST'&&loc.pathname==='/api/bridge/ops'){
          const body=await readJson();const r=await bridge.ops.update(body);return sendJson(r.status,r.body);
        }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/messages'){
          const guildId=id(loc.searchParams.get('guildId'));
          const userId=id(loc.searchParams.get('userId'));
          const adminId=id(loc.searchParams.get('adminId'));
          if(!guildId||!userId||!adminId)return sendJson(400,{error:'Ungültige Anfrage'});
          try{return sendJson(200,{ok:true,...await bridge.messages(guildId,userId,adminId)});}
          catch(e){return sendJson(403,{error:e.message});}
        }
        if(req.method==='POST'&&loc.pathname==='/api/bridge/resolve-invite'){
          const body=await readJson();
          try{return sendJson(200,{ok:true,...await bridge.resolveInvite(body.invite,body.adminId)});}
          catch(e){return sendJson(403,{error:e.message});}
        }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/member'){const userId=id(loc.searchParams.get('userId'));if(!userId)return sendJson(400,{error:'Ungültige Discord-ID'});const profile=await bridge.detail(userId);return profile?sendJson(200,{member:profile}):sendJson(404,{error:'Mitglied nicht in der Verifizierungsdatenbank'});}
        if(req.method==='POST'&&loc.pathname==='/api/bridge/role-claim') { const body=await readJson(); const r=await bridge.roleAdmin.claimGuildCode(body.guildId,body.code);return sendJson(r.status,r.body); }
        if(req.method==='GET'&&loc.pathname==='/api/bridge/role-catalog') {const r=await bridge.roleAdmin.catalog(String(loc.searchParams.get('guildId')||''),String(loc.searchParams.get('userId')||''),String(loc.searchParams.get('adminId')||''));return sendJson(r.status,r.body);}
        if(req.method==='POST'&&loc.pathname==='/api/bridge/role-request') {const body=await readJson();const r=await bridge.roleAdmin.requestChange(body);return sendJson(r.status,r.body);}
        if(req.method==='GET'&&loc.pathname==='/api/bridge/role-status') {const r=bridge.roleAdmin.status({requestId:String(loc.searchParams.get('requestId')||''),guildId:String(loc.searchParams.get('guildId')||''),adminId:String(loc.searchParams.get('adminId')||'')});return sendJson(r.status,r.body);}
        if(req.method==='POST'&&loc.pathname==='/api/bridge/transfer') {
          const body=await readJson();
          const guildId=id(body.guildId);
          const userIds=Array.isArray(body.userIds)?body.userIds.map(id):[];
          if(!guildId||userIds.length<1||userIds.length>20||userIds.some(x=>!x)||new Set(userIds).size!==userIds.length)return sendJson(400,{error:'Ungültige Member-Transfer-Anfrage'});
          const results=await bridge.transfer(guildId,userIds);
          return sendJson(200,{ok:true,results});
        }
        return sendJson(404,{error:'Route unbekannt'});
      }

      if(req.method==='GET'&&loc.pathname==='/transcript/attachment'){
        const token=String(loc.searchParams.get('token')||''),fileId=String(loc.searchParams.get('file')||'');
        if(!/^[0-9a-f]{48}$/.test(token)||!/^m\d+-a\d+$/.test(fileId))return send(404,'Nicht gefunden');
        const entry=(store.state.supportTranscriptIndex||{})[token];if(!entry?.file)return send(404,'Nicht gefunden');
        let document;
        try{document=JSON.parse(require('node:fs').readFileSync(entry.file,'utf8'));}catch{return send(404,'Nicht gefunden');}
        const attachment=(document.items||[]).flatMap(x=>x.attachments||[]).find(a=>a.localFile===fileId);
        if(!attachment)return send(404,'Nicht gefunden');
        const fs=require('node:fs'),p=require('node:path');
        const group=String(attachment.localGroup||String(document.ticketId)+'-files');
        if(!/^[0-9a-f-]{8,64}-files(?:-[0-9a-f-]{36})?$/i.test(group))return send(404,'Nicht gefunden');
        const base=p.resolve(p.dirname(entry.file),group);
        const diskFile=p.resolve(base,fileId);
        if(!diskFile.startsWith(base+p.sep))return send(404,'Nicht gefunden');
        // Reject symbolic links in both the attachment directory and file. Open
        // with O_NOFOLLOW so a file swap between lstat() and open() cannot leak
        // unrelated server files (e.g. .env) to someone holding a transcript link.
        let fd,meta;
        try{
          if(!fs.lstatSync(base).isDirectory()||!fs.lstatSync(diskFile).isFile())return send(404,'Nicht gefunden');
          fd=fs.openSync(diskFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
          meta=fs.fstatSync(fd);
          if(!meta.isFile()||meta.size>25*1024*1024){fs.closeSync(fd);return send(404,'Nicht gefunden');}
        }catch{if(fd!==undefined)try{fs.closeSync(fd);}catch{}return send(404,'Nicht gefunden');}
        const safeName=String(attachment.name||'datei').replace(/[^\x20-\x7e]|[\\"\r\n]/g,'_').slice(0,100);
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${safeName}"`,'Content-Length':String(meta.size),'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
        fs.createReadStream(diskFile,{fd,autoClose:true}).pipe(res);return;
      }
      if(req.method==='GET'&&loc.pathname==='/transcript'){
        const token=String(loc.searchParams.get('token')||'').trim();
        const map=store.state.supportTranscriptIndex||{};
        const entry=map[token];
        if(!entry||!entry.file)return send(404, transcriptWrap('Transkript nicht gefunden', '<section class="hero"><div class="kicker">Novora Transcript</div><h1>Transkript nicht gefunden</h1><p>Dieser Link ist ungültig oder das Transkript ist nicht mehr verfügbar.</p></section>'));
        let payload;
        try{ payload=JSON.parse(require('node:fs').readFileSync(entry.file,'utf8')); }
        catch{ return send(404, transcriptWrap('Transkript fehlt', '<section class="hero"><div class="kicker">Novora Transcript</div><h1>Transkript nicht verfügbar</h1><p>Die gespeicherte Datei konnte nicht gelesen werden.</p></section>')); }
        const items=Array.isArray(payload.items)?payload.items:[];
        const messages=items.length?items.map(item=>`<article class="message"><div class="head"><div class="name">${escape(item.username||item.userId||'Unbekannt')}</div><div class="time">${escape(fmtDate(item.at))}</div></div><div class="text">${escape(item.text||'')}</div>${(item.attachments||[]).length?`<div class="muted" style="margin-top:8px">Anhänge: ${(item.attachments||[]).map(a=>a.localFile?`<a style="color:#a6b3ff;margin-right:12px" href="/transcript/attachment?token=${encodeURIComponent(token)}&amp;file=${encodeURIComponent(a.localFile)}">📎 ${escape(a.name||'Datei')}</a>`:`<span>${escape(a.name||'Nicht gesicherter Anhang')}</span>`).join(' ')}</div>`:''}</article>`).join(''):'<div class="empty">Keine Nachrichten im Transkript gespeichert.</div>';
        const body=`<section class="hero"><div class="kicker">Novora Transcript</div><h1>${escape(payload.guildName||entry.guildName||'Server')}</h1><p>Online-Transkript für ein Novora-Supportticket. Titel: <strong>${escape(payload.title||entry.title||'Support-Ticket')}</strong>.</p><div class="meta"><div class="pill">Ticket-ID: ${escape(String(payload.ticketId||entry.ticketId||'—'))}</div><div class="pill">Geschlossen: ${escape(fmtDate(payload.closedAt||entry.createdAt))}</div><div class="pill">Art: ${escape(String(payload.kind||entry.kind||'ticket'))}</div></div></section><section class="card"><div class="muted">Nachrichtenverlauf</div>${messages}</section>`;
        return send(200, transcriptWrap('Support-Transkript', body));
      }

      if (req.method === 'GET' && loc.pathname === '/health') return send(200, 'ok');
      if (req.method === 'GET' && loc.pathname === '/') return send(200, wrap('Willkommen', '<h1>Novora Verify</h1><p>Du kannst deine Verifizierung über den Verify-Button auf deinem Discord-Server starten.</p>'));
      if(req.method==='GET'&&loc.pathname==='/oauth/start') {
        const gid=id(loc.searchParams.get('guild'));
        if(!gid||!client.guilds.cache.has(gid))return send(404,wrap('Server fehlt','<h1>Discord-Server nicht gefunden</h1>'));
        if(!oauth)return send(503,wrap('OAuth2 fehlt','<h1>Discord OAuth2 ist nicht eingerichtet</h1><p>Bitte DISCORD_CLIENT_SECRET prüfen.</p>'));
        const targets=[...client.guilds.cache.values()].filter(g=>g.id!==gid && store.state.guilds[g.id]?.allowTransfer).slice(0,20).map(g=>g.id);
        // Authorize identity even if no transfer target exists yet.
        const authorization=oauth.begin(gid,targets);
        res.writeHead(303,{Location:authorization,'Cache-Control':'no-store'});return res.end();
      }
      if (req.method === 'GET' && loc.pathname === '/verify') {
        // Legacy link stays compatible but immediately starts the official Discord OAuth2 flow.
        const guildId=id(loc.searchParams.get('guild'));
        if(!guildId||!client.guilds.cache.has(guildId))return send(404,wrap('Fehler','<h1>Server nicht gefunden</h1>'));
        if(!oauth)return send(503,wrap('OAuth2 fehlt','<h1>Discord OAuth2 noch nicht eingerichtet</h1>'));
        const targets=[...client.guilds.cache.values()].filter(g=>g.id!==guildId&&store.state.guilds[g.id]?.allowTransfer).slice(0,20).map(g=>g.id);
        res.writeHead(303,{Location:oauth.begin(guildId,targets),'Cache-Control':'no-store'});return res.end();
      }
      if (req.method === 'POST' && loc.pathname === '/verify/start') {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 2000) return send(413, 'Zu große Anfrage'); }
        const body = new URLSearchParams(raw);
        const guildId = id(body.get('guild'));
        if (!guildId || !client.guilds.cache.has(guildId)) return send(400, wrap('Fehler','<h1>Unbekannter Server</h1>'));
        const allowed = new Set(client.guilds.cache.filter(g => store.state.guilds[g.id]?.allowTransfer && g.id !== guildId).map(g => g.id));
        const targets = body.getAll('target').filter(g => allowed.has(g)).slice(0, 20);
        if (body.getAll('target').length !== targets.length) return send(400, wrap('Fehler', '<p>Transferziele sind ungültig. Bitte erneut versuchen.</p>'));
        if(!oauth)return send(503,wrap('Nicht verfügbar','<p>Optionale Transferfunktion ist nicht eingerichtet.</p>'));
        // No target selection is needed when only authorizing the account.
        const url = oauth.begin(guildId, targets);
        res.writeHead(303, { Location: url, 'Cache-Control':'no-store' }); return res.end();
      }
      if (req.method === 'GET' && loc.pathname === '/oauth/callback') {
        if (loc.searchParams.has('error')) return send(400, wrap('Abgebrochen', '<h1>Verifizierung abgebrochen</h1><p>Discord hat keine Berechtigung erteilt.</p>'));
        if(!oauth)return send(503,wrap('Nicht verfügbar','<p>Optionale Transferfunktion ist nicht eingerichtet.</p>'));
        const result = await oauth.complete(loc.searchParams.get('code'), loc.searchParams.get('state'));
        let roleMessage = '';
        try { await verified(result.member, result.guildId); }
        catch (err) { console.warn('Verify role:',err.message); roleMessage='<p>Die Verifizierung wurde gespeichert, aber eine Rolle konnte nicht automatisch vergeben werden. Bitte Team kontaktieren.</p>'; }
        return send(200, wrap('Erfolgreich verifiziert', `<div class="success-mark" aria-hidden="true">✓</div><h1>Erfolgreich verifiziert</h1><p>Dein Discord-Account wurde bestätigt. Du kannst diese Seite jetzt schließen und zu Discord zurückkehren.</p>${roleMessage}<p class="success-note">Novora Verify · Verifizierung abgeschlossen</p>`));
      }
      return send(404, wrap('Nicht gefunden','<h1>Seite nicht gefunden</h1>'));
    } catch (err) { console.error('OAuth/web error:',err.message); send(400, wrap('Fehler', `<h1>Verifizierung fehlgeschlagen</h1><p>${escape(err.message)}</p><p>Bitte erneut über Discord beginnen.</p>`)); }
  });
  server.listen(port, '0.0.0.0', () => console.log(`Novora bot bridge listening on :${port}`));
  return server;
}
module.exports = { startWebsite };
