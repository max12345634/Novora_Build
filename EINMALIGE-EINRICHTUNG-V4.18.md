# Einmalige Einrichtung für sichere Auto-Updates

## 1. Vorhandene Daten sichern

Im BotHosting-Dateimanager den Bot stoppen und mindestens `.env` sowie den vollständigen Ordner `data/` sichern. Diese beiden Bereiche niemals löschen oder durch Dateien aus der ZIP ersetzen.

## 2. Novora Verify 4.18.0 einmalig installieren

Den Inhalt der BotHosting-ZIP in das bestehende Botverzeichnis hochladen. Die Dateien müssen direkt neben `index.js` liegen, nicht in einem zusätzlichen Unterordner. Vorhandene Programmdateien dürfen ersetzt werden; `.env` und `data/` bleiben erhalten.

Startbefehl: `node index.js`

Erforderliche Node-Version: mindestens 22.12.0. `NOVORA_AUTO_UPDATE=false` deaktiviert die Automatik ausdrücklich; ohne diese Einstellung ist sie aktiv.

Diese einmalige Installation ersetzt den verlorenen öffentlichen Vertrauensschlüssel kontrolliert. Der neue private Ed25519-Schlüssel ist nicht Bestandteil der Bot-ZIP, des Control Centers oder eines Release-Ordners.

## 3. Veröffentlichung freigeben

1. Als Eigentümer der Discord-Bot-Anwendung `/update-verbinden` ausführen.
2. Das Control Center öffnen: https://novora-verify-control-center-ae02zt.v2.appdeploy.ai/
3. Unter „Einstellungen“ die BotHosting-Domain und den achtstelligen Code eingeben.
4. Der Code gilt zehn Minuten, wird nur einmal akzeptiert und schaltet die Update-Veröffentlichung frei.
5. Mit `/update-trennen` lässt sich diese Veröffentlichungsfreigabe jederzeit widerrufen.

Der Verbindungscode ist nur die Veröffentlichungsberechtigung. Der Bot installiert weiterhin ausschließlich Releases mit der fest eingebauten Ed25519-Signatur und passenden SHA-256-Prüfsummen.

## 4. Signiertes Testrelease 4.18.1 veröffentlichen

Den gelieferten Ordner `NovoraVerify_Signed_Release_4.18.1` lokal entpacken. Im Control Center zu „Control Center“ gehen, bei „Signiertes Update veröffentlichen“ den entpackten Release-Ordner auswählen, einen Changelog eintragen und einmal „Update veröffentlichen“ anklicken.

Das Control Center prüft Signatur, Version, Dateipfade, doppelte Pfade/URLs, Dateigrößen und SHA-256 zuerst im Browser und anschließend vollständig auf dem Server. Sämtliche Dateien werden dauerhaft gespeichert und zurückgelesen. Erst danach wird `latest.json` atomar aktiviert.

Der Bot prüft ungefähr 16 Sekunden nach dem Start und danach alle zehn Minuten. `/update-status` zeigt Prüfung, Feedzustand, Installation und Fehler getrennt an.

## 5. Kontrolle

Nach der Veröffentlichung:

- `/update-status` muss schließlich Version `4.18.1` und eine Installationszeit anzeigen.
- Das Dashboard muss denselben aktuellen Stand melden.
- Unter `data/update-backups/` bleibt eine begrenzte, persistente Sicherung erhalten.
- Bei einem Installations- oder Startfehler wird automatisch zurückgerollt. Ein gültiges, nach einem Absturz verbliebenes Journal wird beim nächsten Start automatisch wiederhergestellt. Beschädigte Recovery-Daten sperren den Start und verlangen die Offline-Prüfung mit `npm run recover:check`.

## Künftiger Ein-Klick-Ablauf

Neue Version im Arbeitsquellstand setzen, lokal mit `NOVORA_SIGNING_KEY_FILE` und `scripts/build-signed-release.js` signieren, Ausgabe mit `scripts/verify-release-output.js` prüfen, den Ausgabeordner im Control Center auswählen und „Update veröffentlichen“ anklicken. Der private Schlüssel bleibt dabei ausschließlich auf dem geschützten Signierrechner.
