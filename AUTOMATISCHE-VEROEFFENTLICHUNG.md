# Vollautomatische Novora-Veröffentlichung

Normale Bot-Releases benötigen weder einen Browser-Upload noch ein neues
AppDeploy-Deployment. Das Control Center stellt dafür dauerhaft die geschützte
Maschinen-API und den unveränderlichen Release-Speicher bereit.

## Freigabekette

1. Quellcode ändern und Patchversion in `package.json` sowie
   `src/version-label.js` konsistent erhöhen.
2. Einen Changelog als Textdatei erstellen.
3. Die privaten Schlüssel ausschließlich über die geschützten Umgebungsvariablen
   `NOVORA_SIGNING_KEY_FILE` und `NOVORA_PUBLISHER_KEY_FILE` bereitstellen.
4. `npm run release:auto -- <Version> <Changelog-Datei>` ausführen.

Der Befehl führt die komplette Testsuite aus, baut ein Ed25519-signiertes
Release, prüft Signatur, Pfade, Dateiformate und SHA-256, lädt jede Datei über
eine kurzlebige releasegebundene Sitzung hoch, aktiviert den Feed atomar und
lädt anschließend den Feed und sämtliche Dateien erneut herunter.

Der private Release-Schlüssel und der private Publisher-Schlüssel dürfen nie in
Git, ZIP-Dateien, Logs, Browserfelder oder Chatnachrichten gelangen. Ein Fehler
in einem beliebigen Schritt bricht den Lauf vor einer Erfolgsmeldung ab.

## Sicherer Zugriff außerhalb von Codex

Der maßgebliche Quellstand liegt in einem privaten GitHub-Repository. ChatGPT
arbeitet dort ausschließlich über den verbundenen GitHub-Connector mit Branches
und Pull Requests. Es erhält weder Bot-Token noch private Signierschlüssel.

GitHub Actions führt für jeden Pull Request Syntax- und Regressionstests aus.
Nur ein Commit auf `main` mit einer höheren, in `package.json` und
`src/version-label.js` identischen Version sowie passenden
`release-notes/<Version>.md` darf den Release-Job erreichen. Die privaten
Ed25519-Schlüssel liegen als geschützte Actions-Secrets vor, werden nur im
kurzlebigen Runner mit Dateimodus 0600 materialisiert und anschließend gelöscht.
Der serverseitige Publisher verlangt zusätzlich die widerrufbare
Discord-Updatefreigabe. Ein Fehler in Tests, Version, Feed, Signatur, Upload oder
BotHosting-Liveprüfung beendet den Job ohne Erfolgsmeldung.

## Live-Nachweis

Nach der Veröffentlichung wird gewartet, bis der BotHosting-Healthcheck den
Header `X-Novora-Version` mit der neuen Version liefert. Erst dann ist die
Installation auf BotHosting nachgewiesen. Das Control Center muss nur dann neu
bereitgestellt werden, wenn seine eigene Backend- oder Frontend-Logik geändert
wird; gewöhnliche Bot-Releases verbrauchen kein Website-Deployment.
