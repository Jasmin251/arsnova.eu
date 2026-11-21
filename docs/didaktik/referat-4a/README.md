# Evidenz Referat 4A – Fehlerfälle und fachlich richtige Degradation

Laborversuch zum Auftrag 4A aus
[CLOUD-COMPUTING-REFERAT-PRUEFUNG.md](../CLOUD-COMPUTING-REFERAT-PRUEFUNG.md)
(Abschnitt 4.6). Ergebnisse und Referenzmanifest stehen im
[Versuchsprotokoll](Versuchsprotokoll-4A.md).

Durchführung agentengestützt (Claude); Auftrag, Freigabe und Gegenprüfung durch
die Studierende. Die Skripte sind Messwerkzeuge für eine isolierte
Laborinstanz, kein Teil der Anwendung und nicht für Produktion gedacht.

## Inhalt

| Pfad                        | Inhalt                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Versuchsprotokoll-4A.md`   | Manifest, Testdaten, Messergebnisse, Befunde, Grenzen                                                   |
| `scripts/driver.mjs`        | Sechs-Fragen-Szenario anlegen; Summary, Themenanalyse, Quellenbindung, Löschfall, Join/Vote             |
| `scripts/lo-driver.mjs`     | Quiz und Lernziele anlegen, Ableitung auslösen, Erhalt bestätigter Ziele prüfen                         |
| `scripts/fake-llm.mjs`      | Fault-Injection-Adapter: imitiert `llama-server`, liefert ungültige Ausgaben (`FAULT=garbage`/`schema`) |
| `scripts/shot.mjs`          | Browser-Screenshots des Host-Kompasses (Playwright)                                                     |
| `scripts/wait-ready.mjs`    | wartet, bis kein Summary-Auftrag mehr läuft                                                             |
| `scripts/start-backend*.sh` | Backend mit Laborflags starten (1.4.0 bzw. 1.3-Arbeitskopie)                                            |
| `scripts/run13-*.sh`        | Störungsserien auf Release 1.3                                                                          |
| `scripts/s.py`, `l.py`      | Kurzauswertung der Treiberausgaben                                                                      |
| `rohdaten/`                 | Rohausgaben je Stand und `manifest.txt`                                                                 |
| `screenshots/`              | Kompass im Normalbetrieb und bei gestoppter Runtime, Fallback-Anzeige                                   |

## Voraussetzungen

- Abhängigkeiten installiert (`npm ci`), Prisma-Client generiert, Bibliotheken gebaut
  (`npm run build:libs`), Datenbank migriert.
- `docker compose up -d postgres redis`
- Private Runtime: Modell laut `docker/open-weight-llm/model-manifest.json`
  herunterladen und Prüfsumme kontrollieren, dann
  `docker compose --profile llm-http up -d open-weight-llm-http` mit
  `OPEN_WEIGHT_LLM_MODEL_DIR` und einem zufälligen `OPEN_WEIGHT_LLM_TOKEN`.
- Denselben Token in `scripts/.state/llm_token` ablegen (Verzeichnis ist per
  `.gitignore` ausgeschlossen; dort landen auch Session-Zustände mit Host-Tokens).
- Für Labels: Encoder nativ starten, z. B.
  `WORD_CLOUD_ENCODER_HTTP_BIND=127.0.0.1:8790 python docker/wordcloud-encoder/server.py`,
  und `scripts/sem.env` einlesen.
- Für Release 1.3: Arbeitskopie per `git worktree add <pfad> 85ebdb8c`, eigene
  Datenbank `arsnova_13`, dann `ARSNOVA_13_DIR=<pfad>` setzen.

## Ablauf (Beispiel Release 1.3)

```bash
export ARSNOVA_13_DIR=/pfad/zur/1.3-arbeitskopie
. docs/didaktik/referat-4a/scripts/sem.env
docs/didaktik/referat-4a/scripts/start-backend13.sh
node docs/didaktik/referat-4a/scripts/driver.mjs setup docs/didaktik/referat-4a/scripts/.state/s13.json
node docs/didaktik/referat-4a/scripts/driver.mjs summary docs/didaktik/referat-4a/scripts/.state/s13.json
docs/didaktik/referat-4a/scripts/run13-faults.sh
```

Der Host-Zugang läuft standardmäßig nach 15 Minuten ab; die Startskripte setzen
für das Labor `HOST_SESSION_TTL_SECONDS=14400`. Für Screenshots das Frontend mit
`npm run start -w @arsnova/frontend` starten; ein eigener Chromium-Pfad lässt sich
über `CHROMIUM_PATH` setzen.

## Hinweise

- Versuche nur gegen eine isolierte lokale Instanz ausführen, nie gegen den
  öffentlichen Dienst.
- Die Rohdaten enthalten keine Tokens oder Personendaten; Teilnehmende sind
  simuliert.
