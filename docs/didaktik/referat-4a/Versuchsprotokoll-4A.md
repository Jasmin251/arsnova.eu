# Versuchsprotokoll Auftrag 4A – Fault-Injection am Moderationskompass

Datum: 21.11.2026 · Durchführung: agentengestützt (Claude), Auftrag, Freigabe und Gegenprüfung durch die Studierende

## 1. Referenzmanifest

| Punkt                        | Wert                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hauptstand (Release 1.3)** | Commit `85ebdb8c` (22.10.2026, »bump workspace version to 1.3.0«). Kein offizieller Release-Tag vorhanden; Commit-Wahl begründet über Versionssprung und Stand der Prüferfragen (23.10.2026). **Vom Prüfer zu bestätigen.**                                                                                                |
| Vergleichsstand              | Commit `679b8934` (Paketversion 1.4.0)                                                                                                                                                                                                                                                                                     |
| Umgebung                     | Cloud-Container, 4 vCPU Intel Xeon 2,1 GHz, 15 GB RAM, Node 22.23.5; App, PostgreSQL, Redis, LLM und Encoder auf einem Host (Same-Host-Labor nach ADR-0035)                                                                                                                                                                |
| LLM-Runtime                  | `llama-server` b10524, Image `ghcr.io/ggml-org/llama.cpp:server-b10524@sha256:57e505f6…`, Profil `llm-http`, 4 Threads, Token-Auth (ohne Token HTTP 401); in beiden Ständen unverändert                                                                                                                                    |
| Modell                       | Qwen3-4B-Instruct-2507 Q4_K_M, SHA-256 `3605803b…e597` (gleich `model-manifest.json`)                                                                                                                                                                                                                                      |
| Encoder                      | Xenova/multilingual-e5-small (ONNX), `docker/wordcloud-encoder/server.py`, HTTP 127.0.0.1:8790                                                                                                                                                                                                                             |
| Flags                        | `QA_SUMMARY_ENABLED=true`, `OPEN_WEIGHT_LLM_ENABLED=true`, `WORD_CLOUD_SEMANTIC_ENABLED=true`; Laborabweichungen: `QA_SUMMARY_COOLDOWN_MS=5000` (Default 30000), `HOST_SESSION_TTL_SECONDS=14400` (Default 900, da das Skript den Host-Zugang nicht verlängert); sonst Defaults (Summary 90 s, Label 30 s, Lernziel 300 s) |

## 2. Testdaten

Sechs-Fragen-Szenario aus #456, Abschnitt 12 (`moderation-prompt-context-fixtures.ts`): Texte und Freigabestatus 1:1 (A, D, F `PENDING`; B, E `ACTIVE`; C `PINNED`). Stimmen 1:10 skaliert (12 simulierte Teilnehmende statt N = 200); `PENDING`-Fragen ohne Stimmen (über die API nicht abstimmbar). Label-Versuch in einer zweiten Session mit allen sechs Fragen freigegeben (Themenanalyse gruppiert nur freigegebene Fragen). Lernziele: Quiz aus den ersten vier Fragen des Demo-Quiz, ein bestätigtes und ein Entwurfs-Ziel (beide manuell).

## 3. Ergebnisse Release 1.3 – Summary-Auftrag (n = 5 je Störung)

| Störung                                  | Zeit bis Ergebnis | Modus      | Grund                                         | Retry  |
| ---------------------------------------- | ----------------: | ---------- | --------------------------------------------- | ------ |
| **keine (Baseline)**                     |       90,3–90,4 s | extractive | `timeout` (5/5)                               | manual |
| Timeout auf 2 s gesetzt                  |       2,23–2,31 s | extractive | `timeout` (5/5)                               | manual |
| Slot belegt (Slot-Sonde HTTP 503)        |       0,39–0,49 s | extractive | `busy` (5/5)                                  | manual |
| LLM-Container gestoppt                   |       0,39–0,46 s | extractive | 3× `unavailable`, dann 2× `circuit_open`      | manual |
| Nicht-JSON (Testadapter)                 |       0,39–0,48 s | extractive | 3× `invalid_response`, dann 2× `circuit_open` | manual |
| JSON mit erfundener Quelle (Testadapter) |       0,39–0,49 s | extractive | 3× `invalid_response`, dann 2× `circuit_open` | manual |
| Frage E 1,7 s nach Start gelöscht        |            90,3 s | extractive | `source_changed`                              | manual |

**Baseline-Befund:** Unter 1.3 schickt die App einen Prompt mit 2123 Tokens (1.4.0: 552). `llama-server` bricht jeden Lauf nach 90 s ab (`cancel task`). In dieser Umgebung ist die generative Kurzfassung unter 1.3 also nie fertig; der extraktive Fallback fängt das ab. Ursache im Code nicht untersucht.

**Quellenbindung (geprüft):** Alle Aussagen verweisen auf Quellen des Ergebnisses; jede Quelle (`qa-question:<id>`) gehört zu einer Frage der Session, Text identisch (D, F, E, C). Nach Löschung von E erscheinen nur F, A, C, B; E fehlt.

## 4. Ergebnisse Release 1.3 – Label-Auftrag

| Störung                                              |   n |        Zeit | Status | Cluster         | Labelherkunft                          | Settlement   |
| ---------------------------------------------------- | --: | ----------: | ------ | --------------- | -------------------------------------- | ------------ |
| keine (Baseline)                                     |   3 | 10,1–11,0 s | ready  | 2/1/2/1         | 2× model, 2× extractive (Einzelfragen) | complete     |
| Label-Timeout 1 s                                    |   5 |       2,1 s | ready  | 2/1/2/1         | 4× extractive                          | transient    |
| LLM-Slot belegt                                      |   5 | 0,16–0,26 s | ready  | 2/1/2/1         | 4× extractive                          | transient    |
| LLM gestoppt                                         |   5 | 0,14–0,17 s | ready  | 2/1/2/1         | 4× extractive                          | transient    |
| Ungültige Ausgabe (Nicht-JSON / Schema, Testadapter) | 3+3 | 0,13–0,17 s | ready  | 2/1/2/1         | 4× extractive                          | **complete** |
| **Encoder** gestoppt (Kontrast)                      |   3 | 0,07–0,09 s | failed | lexikalisch 2/1 | –                                      | –            |

Baseline-Labels: »lineare Regression« (A+B), »Anwesenheitspflicht« (E+F). C/D bildet der Encoder nicht als Paar ab. Ungültige Ausgaben gelten als nicht vorübergehend (`complete`), Timeout/Belegung/Ausfall als vorübergehend (`transient`).

## 5. Ergebnisse Release 1.3 – Lernziel-Auftrag (Session-Ableitung)

| Störung                         |   n |     Zeit | Status                                                        | Bestätigtes Ziel | Entwurf     | Neue Ziele |
| ------------------------------- | --: | -------: | ------------------------------------------------------------- | ---------------- | ----------- | ---------- |
| LLM gestoppt                    |   3 | 17–27 ms | 2× `unavailable`, dann `circuit_open`*                        | unverändert      | unverändert | 0          |
| Slot belegt                     |   3 | 21–55 ms | `busy`, `retry: manual`                                       | unverändert      | unverändert | 0          |
| Ungültige Ausgabe (Testadapter) |   3 | 20–48 ms | `invalid_response`                                            | unverändert      | unverändert | 0          |
| Timeout auf 5 s                 |   2 |   5,04 s | `timeout`                                                     | unverändert      | unverändert | 0          |
| **keine (Baseline)**            |   1 |   41,5 s | **Fehler beim Speichern** (`Unknown argument objectiveRowId`) | unverändert      | unverändert | 0          |

\* Der Circuit Breaker ist für alle drei Aufträge gemeinsam: Ein vorheriger Summary-Fehler zählte mit.

Manuelle Eingabe nach `busy`: neues bestätigtes Ziel erfolgreich gespeichert.

**Befund 1.3:** Das Modell erzeugte einen Entwurf (»Runden einer Zahl auf zwei Dezimalstellen«), das Speichern scheiterte an einem Prisma-Fehler in `sessionLearningObjectives.ts` (verschachteltes `create` mit `objectiveRowId`). Behoben in Commit `88a5bac7` (19.11.2026). **Gegenprobe 1.4.0:** `completed` nach 31,9 s, zwei Entwürfe angehängt, bestätigtes Ziel und Entwurf unverändert.

## 6. Hotpath Release 1.3 (Join + Q&A-Vote, je 20 Läufe)

| Zustand              | Join p50 / p95 | Vote p50 / p95 | Fehler |
| -------------------- | -------------- | -------------- | ------ |
| Baseline             | 25 / 32 ms     | 12 / 29 ms     | 0      |
| während Timeout-Lauf | 34 / 81 ms     | 17 / 55 ms     | 0      |
| während Slot belegt  | 33 / 57 ms     | 17 / 54 ms     | 0      |
| während LLM-Ausfall  | 26 / 41 ms     | 13 / 31 ms     | 0      |

Release-SLO nach ADR-0021 (»stable«: Fehler ≤ 0,5 %, p95 ≤ 1000 ms, p99 ≤ 2000 ms): in allen Zuständen eingehalten.

## 7. Host-Anzeige Release 1.3 (Browser, Playwright)

- Regelkompass bei gestopptem LLM identisch mit Normalbetrieb (nächster Schritt, Karten »Umstrittene Fragen« und »Noch klären«, Quellen). Abbildungen `2-ki-aus-kompass.png` vs. `1-normal-kompass.png`.
- Fallback-Anzeige: vier Fragen im Wortlaut, Hinweis »Extraktive Kurzfassung ohne generative Interpretation«, »Belege (4)«. Der Grund (z. B. Timeout) wird nicht angezeigt; Retry über den wieder aktiven Button. Sichtbar nach 2,0 s (LLM aus) bzw. 92,4 s (Baseline).
- **Befund:** Wird die Host-Seite neu geladen, während ein Auftrag läuft, startet kein Polling; die Anzeige bleibt auf »Die Zusammenfassung wird erstellt« und der Button gesperrt, bis der Kompass neu geöffnet wird (beobachtet > 150 s; `refreshQaSummaryRuntime` startet kein Polling, in 1.3 und 1.4.0).

## 8. Vergleich 1.4.0 (Commit 679b8934, n = 1–3)

Summary-Baseline generativ in 11,1–19,8 s (zwei belegte Themen). Fallback-Zeiten und -Gründe wie unter 1.3 (Timeout 2,2–2,3 s, `busy` 0,36–0,52 s, `unavailable`/`circuit_open` 0,36–0,46 s, `invalid_response` 0,45–0,49 s). Wiederanlauf nach LLM-Neustart: technisch nach 5,2 s, erste generative Kurzfassung bei t+30,5 s (30-s-Sperre des Circuit Breakers). Labels wie 1.3. Lernziel-Baseline erfolgreich (siehe §5).

## 9. Nicht geprüft

`queue_full` (Queue-Limit 8); viele gleichzeitige Retries mehrerer Hosts (Thema 3); Wiederanlauf-Zeit unter 1.3 (generative Kurzfassung dort nie fertig); Produktionshardware mit getrenntem LLM-Host.

## 10. Artefakte

Skripte unter `scripts/`, Rohausgaben unter `rohdaten/release-1.3/` und `rohdaten/release-1.4.0/`, Manifest unter `rohdaten/manifest.txt`, Screenshots unter `screenshots/`. Anleitung in der [README](README.md).
