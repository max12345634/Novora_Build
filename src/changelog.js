'use strict';
const fs=require('node:fs');
const path=require('node:path');
const BUILTIN=[
 {version:'4.18.5',date:'2026-10-25',title:'Atomare Schließungsanfragen für Supporttickets',changes:['Gleichzeitige Schließungsanfragen teilen dieselbe Ticket-Sperre und lösen nur eine Team-Benachrichtigung aus','Schließungsanfrage und Ablehnung stellen bei Speicherfehlern den bisherigen Zustand wieder her','Beschwerderollen und bestehende Berechtigungen bleiben erhalten; vier Regressionstests ergänzen den Schutz']},
 {version:'4.18.4',date:'2026-10-25',title:'Übernahmezeit in Supporttickets sichtbar',changes:['Ticket-Karten zeigen den Zeitpunkt der Teamübernahme als Discord-Zeitstempel an','Offene und wieder freigegebene Tickets zeigen statt einer veralteten Uhrzeit den Status Noch nicht übernommen','Regressionstest prüft Übernahme, sichtbare Zeit und Freigabe ohne Verlust bestehender Ticketdaten']},
 {version:'4.18.3',date:'2026-10-24',title:'Automatische Ticketübernahme bei Teamantwort',changes:['Erste substanzielle Teamantwort übernimmt offene Supporttickets automatisch, ohne Befehle oder kurze Nachrichten auszuwerten','Gleichzeitige Antworten und manuelle Übernahme teilen dieselbe Ticket-Sperre: nur ein Bearbeiter und eine Übernahmemeldung','Rolle und Anzeigename erscheinen im privaten Ticket, bestehende Panels zeigen den Bearbeiter','Fehlgeschlagene Speicherung stellt den ursprünglichen Ticketstatus wieder her; Regressionstests für Rennen, Rechte und Fehler']},
 {version:'4.18.2',date:'2026-10-24',title:'Vollautomatische signierte Veröffentlichung',changes:['Maschinell authentifizierter Release-Upload ohne Browser-Klick','AppDeploy-Feed kanonisch vor jeder Auslieferung validiert','Öffentliche Health-Antwort nennt die laufende Version zur automatischen Live-Prüfung']},
 {version:'4.18.0',date:'2026-10-23',title:'Signierte Ein-Klick-Updates vollständig verbunden',changes:['Dauerhafter Release-Dienst im Novora Control Center','Kontrollierter Ed25519-Schlüsselwechsel mit neuem Vertrauensanker','Atomare Veröffentlichung nach Signatur-, Pfad- und SHA-256-Prüfung','Widerrufbare Freigabe über /update-verbinden und /update-trennen','Präzise Feed-, Recovery- und Rollback-Statusmeldungen']},
 {version:'4.17.5',date:'2026-10-23',title:'Verifizierter Rollback und Voice-Fallabschluss',changes:['Automatischer Rollback prüft sämtliche Sicherungen vor der ersten Änderung mit SHA-256','Wiederherstellung einzelner Dateien über geprüfte temporäre Dateien und atomare Umbenennung','Wartende Voice-Fälle lassen sich im Dashboard tatsächlich schließen, mit Status und Auditprotokoll','Bereits geschlossene oder in Übertragung befindliche Voice-Fälle werden nicht fälschlich als erfolgreich geschlossen gemeldet']},
 {version:'4.17.4',date:'2026-10-23',title:'Geprüfter Wiederherstellungs-Assistent',changes:['Manuelle Wiederherstellung aus persistenten Backups mit Vorschau ohne Schreibzugriff','Backup-Hashes im Wiederherstellungsjournal und SHA-256-Prüfung vor dem Zurückspielen','Manipulierte Dateipfade, fehlende Sicherungen und symbolische Links werden abgewiesen','Nach erfolgreicher Wiederherstellung wird die Start-Sperre kontrolliert aufgehoben']},
 {version:'4.17.3',date:'2026-10-23',title:'Dauerhafte Update-Wiederherstellung',changes:['Rollback-Sicherungen werden im Bot-Datenverzeichnis statt im flüchtigen System-Temp gespeichert','Vor Dateiersetzung wird ein Wiederherstellungsjournal erstellt','Nach einem abgebrochenen Update startet der Bot nicht mit möglicherweise unvollständigen Dateien','Ed25519-, SHA-256- und Staging-Prüfungen bleiben aktiv']},
 {version:'4.17.2',date:'2026-10-23',title:'Kritischen Installationsfehler absichern',changes:['Bot-Neustart verhindern, wenn Installation und Wiederherstellung gleichzeitig fehlschlagen','Erhaltene Sicherung und manuellen Wiederherstellungsbedarf melden']},
 {version:'4.17.1',date:'2026-10-23',title:'Rollback-Sicherung erhalten',changes:['Sicherung bei fehlgeschlagener Wiederherstellung nicht löschen','Kritische Wiederherstellungsfehler gesondert melden']},
 {version:'4.17.0',date:'2026-10-23',title:'Einfache Update-Verbindung und vollständige Fall-ID-Suche',changes:['Neuer Owner-Befehl /update-verbinden für den vorhandenen Website-Verbindungscode','Fall-ID-Suche über alle gespeicherten Fälle statt nur die letzten 100','Ed25519, Hashprüfung und Rollback bleiben unverändert']},
 {version:'4.16.0',date:'2026-10-23',title:'Dashboard-Fall-ID-Suche und Versionskonsistenz',changes:['Geschützte Fall-ID-Suche für Tickets und Voice über die vorhandene Dashboard-Bridge','Administratorberechtigung wird vor jeder Suche erneut geprüft','Falltyp und ID werden streng validiert','Versionsstand der bisherigen V4.15 korrigiert und Tests ergänzt']},
 {version:'4.15.0',date:'2026-10-23',title:'Ticket- und Voice-Protokolle',changes:['Strukturierte Discord-Embeds für Ticket- und Voice-Logs']},
 {version:'4.14.0',date:'2026-10-23',title:'Community-Standardsysteme',changes:['Giveaways, Rollenpanel, Vorschläge, Verwarnungen, Level/XP und Events','RP-Start, RP-Ende und Status bleiben; RP-Dienst und RP-Meldung nicht mehr registriert','Gesicherte Persistenz mit Rollback bei Speicherfehlern']},
 {version:'4.13.0',date:'2026-10-23',title:'Notruf Hamburg RP-Verwaltung',changes:['RP-Runden starten, beenden und Status abrufen','RP-Dienstanmeldung mit persistenter Teilnehmerliste','Private RP-Vorfallmeldungen mit Admin-Einsicht und begrenztem Verlauf']},
 {version:'4.12.0',date:'2026-10-23',title:'Voice-Audio-Zwischenspeicher abgesichert',changes:['Einzigartige temporäre WAV-Dateien bei paralleler Sprachgenerierung','Leere oder unvollständige gecachte Audiodateien werden nicht mehr verwendet','Regressionstest für Audio-Cache-Dateien']},
 {version:'4.11.0',date:'2026-10-23',title:'Datenspeicherung und Abschlussprüfung',changes:['Zustandsdatei wird über exklusiv angelegte zufällige temporäre Dateien gespeichert, statt einen festen .tmp-Pfad zu verwenden','Vor dem atomaren Austausch werden Dateiinhalt und Dateihandle synchronisiert','Temporäre Dateien werden auch nach Fehlern bereinigt, die letzte bestätigte state.json bleibt erhalten','Private Dateirechte (0600) für neue gespeicherte Zustandsdateien','Sechs neue Regressionstests für gleichzeitige Speicherung, Symlinks, Wiederherstellung und Fehlerfälle','Ausführliche Discord-/BotHosting-Livetest-Checkliste und Releasebericht']},
 {version:'4.10.0',date:'2026-10-23',title:'Panel-Kompatibilität und sichere Aktualisierung',changes:['Text- und Button-Panels ohne Components-V2-Flag werden korrekt als alte Nachrichten erkannt und sicher migriert','V2-Nachrichten werden anhand des tatsächlichen Discord-Flags statt anhand fehlender Embeds erkannt','Gespeicherte Panels ohne verifizierbare Bot-Identität werden nicht verändert','Erstellte Ersatznachrichten ohne Discord-Nachrichten-ID werden aufgeräumt, alte Panels bleiben bestehen','Wenn das Entfernen eines Ersatzpanels scheitert, wird ausdrücklich auf mögliche Doppelungen hingewiesen','Setup bezeichnet Bewerbungen konsistent nur als Team-Bewerbungen','Elf neue Tests für Discord-Flags, Legacy-Migration, sichere Fehlerbehandlung und Setup-Texte']},
 {version:'4.9.0',date:'2026-10-23',title:'Voice-Support und Mitgliederbegrüßung stabilisiert',changes:['Gleichzeitige Voice-Beitritte erzeugen höchstens eine Verbindung pro Server','Verlassen des Warteraums während eines noch laufenden Beitritts verhindert verwaiste Voice-Verbindungen','Temporäre Voice-Fehler können nach kurzer Pause erneut versucht werden, statt Voice dauerhaft abzuschalten','Audio-Player-Fehler und veraltete Events werden ohne versehentliches Schließen neuer Sitzungen behandelt','Personalisierte Voice-Dateien werden erst nach erfolgreicher Erstellung veröffentlicht; unvollständige Dateien werden entfernt','Fehlgeschlagene Speicherung der Join-/Leave-Kanäle stellt vorherige Konfiguration wieder her','Zwölf neue Regressionstests für Race Conditions, Fehlerbehandlung und Rollback']},
 {version:'4.8.0',date:'2026-10-23',title:'Transkript-Archivierung und Dateischutz',changes:['Jede Archivierung schreibt eine unveränderliche neue Transkriptdatei statt bestehende Backups zu überschreiben','Fehlgeschlagene Archiv-Wiederholungen erhalten vorherige Transkripte, Tokens und Anhänge','Bei unklarer Index-Speicherung bleiben neue Dateien zur sicheren Wiederherstellung erhalten','Dateidownload verweigert symbolische Links und öffnet Anhänge mit O_NOFOLLOW','Bereits verwendete Transkript-Tokens können keinem anderen Ticket zugeordnet werden','Sechs neue Regressionstests für Rollback, Retry, Symlinks und Indexfehler']},
 {version:'4.7.0',date:'2026-10-23',title:'Sichere Ticket- und Antragsabläufe',changes:['Supporttickets nach erfolgreicher Speicherung nicht mehr wegen fehlgeschlagener Panel-Aktualisierung löschen','Fehlgeschlagene Ticket-/Antrags-Speicherung entfernt unbestätigte Datensätze aus dem Arbeitsspeicher','Nach Neustart bereits eingereichte Team-Bewerbung ohne doppeltes Ticket abschließen','Fraktionsforenbeitrag vor der finalen Genehmigung speichern und bei Wiederholung wiederverwenden','Fehlgeschlagene Statusspeicherung macht eine Fraktionsentscheidung erneut versuchbar','Fehlerbehandlung bei fehlgeschlagenen Support-Modals repariert']},
 {version:'4.6.0',date:'2026-10-23',title:'Zuverlässige Panel-Synchronisierung',changes:['Vor Bearbeitung oder Migration gespeicherter Panels die Bot-Urheberschaft prüfen','Alte Embed-Panels erst nach erfolgreicher Speicherung der neuen Panel-ID löschen','Bei fehlgeschlagener Migration gespeicherte IDs wiederherstellen und Ersatznachricht kontrolliert zurücknehmen','Migration ohne Speicherroutine verweigern, damit keine unverwalteten Panels entstehen','Doppelte Versionsmeldung 4.4 aus dem Updateverlauf entfernt','Sechs neue Regressionstests für Panel-ID und Rollback']},
 {version:'4.5.0',date:'2026-10-23',title:'Sicherer Update-Installationsprozess',changes:['Ed25519-Signatur und alle SHA-256-Prüfsummen unmittelbar vor Installation erneut prüfen','Manipulierte Staging-Dateien verhindern Installation ohne Live-Dateien zu verändern','Symlinks in Staging- und Zielpfaden blockieren','Zufällige exklusive temporäre Dateien verhindern Überschreiben bestehender Update-Artefakte','Neue Regressionstests für Manipulation, Symlink-Umleitung und Rollback']},
 {version:'4.4.0',date:'2026-10-22',title:'Kurze Ticketformulare und Team-Bewerbung im Chat',changes:['Pro Supportkategorie zwei kurze eigene Fragen statt langer Formulare','Nur Team-Bewerbungen: DM-Einladung, Start-Button, einzelne Fragen im Chat, Wiederaufnahme nach Neustart','Partnerschaftsformulare unterscheiden Beantragen, Ändern und Kündigen','Private Anhänge in Support-, Partner- und Bewerbungstickets mit Sicherung beim Transkript','Eigene Partnerschafts-Banner für Anträge, Änderungen und Kündigungen','Bestehende Verify-, Sicherheits-, Fraktions- und Voice-Systeme bleiben erhalten']},
 {version:'4.3.0',date:'2026-10-22',title:'Bewerbungen, Fraktionen & Voice-Warteraum',changes:['Eigene Support-Fragen für fünf Kategorien','Bewerbungssystem mit eigenen Fragen','Fraktionsanträge mit Teamprüfung und separaten Legal-/Illegal-Foren','Join-/Leave-Nachrichten pro Server','Voice-Wartemusik und deutsche Begrüßung','Erneuerte Banner im flachen Premium-Stil']},
 {version:'4.2.0',date:'2026-10-22',title:'Custom Emojis & Panel-Aktualisierung',changes:['18 neue flache Custom-Emojis für wichtige Aktionen und Systeme','Einheitliches Emoji-Set für Setup, Ticket-Buttons und Kategorien','Setup-Funktion: alle bereits veröffentlichten Panels per Knopf aktualisieren','Serverbezogene sichere Überarbeitung bestehender Verify-, Ticket- und Partnerschaftspanels','Gefundene Panels werden bearbeitet, fehlende nicht doppelt gepostet','Legacy-Embeds mit Rollback bei fehlgeschlagener Migration']},
 {version:'4.1.0',date:'2026-10-22',title:'Discord Components V2',changes:['Zusammenhängende Panelkarten für Verify, Support, Partnerschaften und Voice','Migration vorhandener alter Embeds ins neue Layout']},
 {version:'4.0.0',date:'2026-10-22',title:'Tickets und Transkripte',changes:['Fünf Supportkategorien','Team-Übernahme, Freigabe und Schließungs-Anfrage','Online-Transkripte und sichere Ticketkanallöschung']},
 {version:'3.9.0',date:'2026-10-22',title:'Premium Panel Redesign',changes:['Partnerschafts- und Ticket-Panels nach der bereitgestellten Discord-Referenz neu gestaltet','Dynamisches Bild mit Servernamen auf jedem Discord-Server','Proportionale Schriftgrafiken und klare Icon-Flächen statt 3D-Effekte','Kompaktes Ticket-Auslastungsfeld und Custom-Emoji-Kategorien','Bestehende Panel-Nachrichten ersetzen alte Bilder beim Aktualisieren','Keine zusätzlichen Hauptbefehle oder Datenspeicher-Änderungen']},
 {version:'3.8.0',date:'2026-10-22',title:'Support Design & Online-Transkripte',changes:['Überarbeitete Ticket- und Partnerschafts-Embeds','Custom-Emojis in Kategorien und Aktionen','Private Online-Transkripte nach Ticketabschluss','Serverbezogene Transkriptansicht','Wiederholte Ticket-Kategorieauswahl bleibt möglich']},
 {version:'3.7.0',date:'2026-10-22',title:'Setup- und Panel-Design',changes:['Nur ein /setup mit Auswahlmenü','Bereinigung doppelter Setup-Befehle','Einheitliche Panel-Banner','Wiederholte Kategorieauswahl repariert']},
 {version:'3.6.0',date:'2026-10-22',title:'Support Suite',changes:['Einheitliche /setup-Konfiguration','Ticket-Panel mit Formularen und Teamübernahme','Voice-Support-Warteraum mit aktualisierten Benachrichtigungen','Private temporäre Voice-Support-Räume','Automatische Schließung bei Ende des Anrufs','Öffentliche und private Bewertungen','Geschützte Dashboard-API für Supportfälle','Support-Statistiken und Restart-Wiederherstellung']},
 {version:'3.5.0',date:'2026-10-22',title:'Partnership Tiers & Analyse',changes:[
  'Kleine Partnerschaft: 1–100 Mitglieder',
  'Mittlere Partnerschaft: 101–699 Mitglieder',
  'Große Partnerschaft: ab 700 Mitgliedern',
  'Sechs neue flache Partnerschafts-Emojis als PNG und SVG',
  'Echte Forum-Tags werden für die drei Größenklassen vorbereitet',
  'Genehmigte Änderungen aktualisieren den ursprünglichen Forumbeitrag',
  'Kategorie, Mitgliederzahl und Qualitätsanalyse werden automatisch neu berechnet',
  'Lokaler Vorprüfungsassistent bewertet Vollständigkeit und Werbetext (keine automatische Annahme)',
  'Analyse-Knopf für zuständiges Team im Ticket',
  'Teamstatistik über /partnerschaft-statistik',
  'Verlauf und Rollenprüfungen aus früheren Versionen bleiben erhalten'
 ]},
 {version:'3.4.0',date:'2026-10-22',title:'Novora Partnerships',changes:[
  'Partnerschafts-Tickets mit drei Kategorien und Discord-Formularen',
  'Private Ticketkanäle nur für Antragsteller und eingestelltes Server-Team',
  'Tickets übernehmen, annehmen, ablehnen und schließen; Teamrechte werden geprüft',
  'Automatische Partnerwerbung im Discord-Forum mit Einladungslink und Ansprechpartner',
  'Partnerrolle und optionaler Namenszusatz nach Annahme',
  'Änderungen und Kündigungen bestehender Partnerschaften',
  'Forum-Archivierung bei bestätigter Kündigung',
  'Benachrichtigungen und optionaler Partnerschafts-Logkanal',
  'Serverbezogene einheitliche Panels mit Emoji-freiem Servernamen',
  'Drei handgezeichnete flache Partnerschafts-Application-Emojis',
  'Sicherheitsprüfung gegen doppelte Tickets und unbefugte Teamaktionen',
  'Keine Ticket Tool Designs oder KI-gerenderten Banner'
 ]},
 {version:'3.3.0',date:'2026-10-22',title:'Owner Alerts & Dashboard',changes:[
  'Private Owner-Benachrichtigungen mit Ein- und Ausschalten pro Discord-Server',
  'Mute-Schalter für kritische Warnungen, Rollen, Moderation und Systemmeldungen',
  'Direkte Rollenänderungen ohne zusätzliche Discord-DM-Bestätigung; Sicherheitsprüfungen bleiben aktiv',
  'Geschützte Rollen bleiben gesperrt; Aktionen werden im Discord-Audit-Log nachvollziehbar gemacht',
  'Mobile Rollenverwaltung mit Suche und zugewiesenen Rollen',
  'Neuer Updateverlauf mit Benachrichtigungssymbol im Dashboard',
  'Privater Testalarm und Statusabfrage in Discord',
  'Anzeigestatus für stummgeschaltete Benachrichtigungen',
  'Manuelle Aktualisierung der Mitgliedsrollen nach Änderung',
  'Öffentliche Update-Metadaten enthalten keine geheimen Zugangsdaten']},
 {version:'3.2.0',date:'2026-10-22',title:'Security Edition',changes:['Manipulationsprüfbares Sicherheitsjournal','Rollen- und Berechtigungslogs','Warnungen für Administratorrechte','OAuth2 und Transferverbesserungen','Flache Sicherheits-Emojis']},
 {version:'3.1.0',date:'2026-10-22',title:'Auto-Update',changes:['Signierter Bot-Updater','Automatische Updateprüfung','Rollback bei Startfehler','Dateisicherung ohne Überschreiben von .env und data/']},
 {version:'3.0.0',date:'2026-10-22',title:'Discord OAuth & Dashboard',changes:['Discord-OAuth2-Verifizierung','Server-Branding','Live-Nachrichtenansicht','Verifizierungszähler','Neues Verify-Panel']},
 {version:'2.0.0',date:'2026-10-22',title:'Control Center',changes:['Panel-Designer','Live-Einstellungen','Bot-Status','Verifizierung pausieren']},
 {version:'1.7.0',date:'2026-10-22',title:'Rollenverwaltung',changes:['Serverbezogene Rollenansicht','Administrator-Freigabecode','Rollenänderungen aus dem Dashboard']}
];
function history(dataDir){
 let installed=[];
 try{
  const x=JSON.parse(fs.readFileSync(path.join(dataDir,'update-history.json'),'utf8'));
  if(Array.isArray(x)) installed=x.slice(-50).map(v=>({version:String(v.version||''),date:new Date(v.time||Date.now()).toISOString().slice(0,10),title:'Automatisch installiert',changes:[String(v.from||'')+' → '+String(v.version||'')]}));
 }catch{}
 // Older auto-update supervisors track last successful install in update-status.json.
 // Present it even before their own code can be manually upgraded.
 try { const status=JSON.parse(fs.readFileSync(path.join(dataDir,'update-status.json'),'utf8'));
   const candidate=String(status.currentVersion||'');
   if(status.lastInstalled&&/^\d+\.\d+\.\d+$/.test(candidate)&&!installed.some(x=>x.version===candidate))
     installed.push({version:candidate,date:new Date(status.lastInstalled).toISOString().slice(0,10),title:'Automatisch installiert',changes:['Signiertes Bot-Update']});
 }catch{}
 return {version:require('./version-label').VERSION,releases:BUILTIN,installed:installed.reverse()};
}
module.exports={history,BUILTIN};
