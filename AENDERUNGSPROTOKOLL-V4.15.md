# Novora Verify V4.15 – Support-Logs

Basis: V4.14. Die bestehenden Daten, `.env` und `data/` werden nicht mitgeliefert.

## Änderungen
- Ticket- und Voice-Support-Logs werden als strukturierte Discord-Embeds statt als rohe Textnachrichten gesendet.
- Ereignistitel, Zeitstempel, betroffenes Mitglied und ausführende Person erhalten eigene Felder.
- Fall-ID, Sprachraum, Nachrichtenanzahl und Transkript werden nach Möglichkeit separat angezeigt.
- Nicht vorhandene Akteur-Information wird ausdrücklich als „Nicht übermittelt“ ausgewiesen, nicht erfunden.
- Keine Massen-Pings durch Log-Einträge (`allowedMentions: {parse:[]}`).
- Vier neue Regressionstests für Zuordnung, Sprachraum, fehlende Akteure und Mentions.

## Grenzen
- Bestehende Log-Aufrufstellen ohne Akteur-Information können diese nicht nachträglich rekonstruieren.
- Nicht alle anderen Protokollarten wurden umgestaltet. Discord-/BotHosting-Livetest steht aus.
- Kein unsigniertes automatisches Release.
