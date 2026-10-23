Novora Verify 3.5 – Signierter Auto-Update-Feed

Diese Inhalte sind AUSSCHLIESSLICH öffentliche Release-Assets (KEINE privaten Schlüssel).
Die Dateien aus public/novora-releases/ müssen im bestehenden AppDeploy-Projekt unter exakt demselben Pfad erreichbar sein.
Beispiel: https://novora-verify-control-center-ae02zt.v2.appdeploy.ai/novora-releases/latest.json

WICHTIG:
- Die Veröffentlichung ist noch nicht erfolgt. ZIP-Download aktiviert keine Bot-Updates.
- Ein bereits auf BotHosting installierter kompatibler Novora-Auto-Updater wird die signierten Dateien prüfen.
- Die Signatur ist an dessen fest eingebauten öffentlichen Schlüssel gebunden.
- Keine einzelnen Release-Dateien manuell verändern; sonst scheitert die Prüfung.
- .env und data/ sind absichtlich nicht enthalten.
- Der Updater kann weder sich selbst noch supervisor.js über diesen Feed ersetzen.
