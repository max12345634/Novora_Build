# Vollautomatische Novora-Veröffentlichung

Normale Bot-Releases benötigen weder einen Browser-Upload noch ein neues
AppDeploy-Deployment. Signierte Artefakte werden atomar in einem getrennten
GitHub-Release-Branch gespeichert. Das Control Center prüft Release- und
Maschinensignatur, die widerrufbare Discord-Freigabe und alle SHA-256-Werte,
bevor es den unveränderten Feed an den Bot ausliefert.

## Freigabekette

1. Quellcode ändern und Patchversion in `package.json` sowie
   `src/version-label.js` konsistent erhöhen.
2. Einen Changelog als Textdatei erstellen.
3. Die privaten Schlüssel ausschließlich über die geschützten Umgebungsvariablen
   `NOVORA_SIGNING_KEY_FILE` und `NOVORA_PUBLISHER_KEY_FILE` bereitstellen.
4. `npm run release:auto -- <Version> <Changelog-Datei>` ausführen.

Der Befehl führt die komplette Testsuite aus, baut ein Ed25519-signiertes
Release, prüft Signatur, Pfade, Dateiformate und SHA-256, aktualisiert den
geschützten Release-Branch mit einem atomaren Git-Commit und lädt anschließend
den Feed und sämtliche Dateien sowohl direkt als auch über AppDeploy erneut
herunter. GitHub und AppDeploy erhalten keinen privaten Schlüssel.

Der private Release-Schlüssel und der private Publisher-Schlüssel dürfen nie in
Git, ZIP-Dateien, Logs, Browserfelder oder Chatnachrichten gelangen. Ein Fehler
in einem beliebigen Schritt bricht den Lauf vor einer Erfolgsmeldung ab.

## Sicherer Zugriff außerhalb von Codex

Der maßgebliche, geheimnisfreie Quellstand liegt im verbundenen GitHub-
Repository. ChatGPT arbeitet dort ausschließlich über Branches und Pull Requests.
`.env`, `data/`, Backups, Logs, Release-Ausgaben und Schlüssel sind durch die
Repository-Regeln ausgeschlossen.

GitHub Actions besitzt keine Novora-Schlüssel. Es führt für jeden Pull Request
Syntax-, Regressionstests und die Prüfung gegen den signierten Live-Feed aus.
Nur ein geprüfter Commit auf `main` mit einer höheren, in `package.json` und
`src/version-label.js` identischen Version sowie passenden
`release-notes/<Version>.md` wird vom getrennten Codex-Release-Worker übernommen.
Dieser Worker läuft im geschützten persistenten Workspace, wiederholt alle Tests,
signiert lokal und veröffentlicht über den Maschinenkanal. ChatGPT und GitHub
erhalten weder Bot-Token noch private Ed25519-Schlüssel. Der serverseitige
Publisher verlangt zusätzlich die widerrufbare Discord-Updatefreigabe. Ein Fehler
in Tests, Version, Feed, Signatur, Upload oder BotHosting-Liveprüfung beendet den
Lauf ohne Erfolgsmeldung.

## Live-Nachweis

Nach der Veröffentlichung wird gewartet, bis der BotHosting-Healthcheck den
Header `X-Novora-Version` mit der neuen Version liefert. Erst dann ist die
Installation auf BotHosting nachgewiesen. Das Control Center muss nur dann neu
bereitgestellt werden, wenn seine eigene Backend- oder Frontend-Logik geändert
wird; gewöhnliche Bot-Releases verbrauchen kein Website-Deployment.
