// Labortreiber für Auftrag 4A: Sechs-Fragen-Szenario (#456 Abschnitt 12) gegen ein lokal laufendes Backend.
// Nutzung: node driver.mjs <setup|summary|hotpath> [stateFile]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync(new URL('./.state/', import.meta.url), { recursive: true });
import { createHttpTrpcSingle } from '../../../../scripts/load/lib/trpc-runtime.mjs';

const TRPC_URL = process.env.TRPC_URL ?? 'http://127.0.0.1:3000/trpc';
const STATE = process.argv[3] ?? new URL('./.state/state.json', import.meta.url).pathname;
const mode = process.argv[2];

// Texte und Freigabestatus 1:1 aus MODERATION_PROMPT_REFERENCE_TEXT/RANKING_FIXTURE_V1.
// Stimmen 1:10 skaliert (Fixture: N=200 Raumbezug), weil nur 12 Teilnehmende simuliert werden.
const SIX = [
  {
    key: 'A',
    text: 'Können wir mehr Beispiele zur linearen Regression bearbeiten?',
    status: 'PENDING',
    up: 8,
    down: 3,
  },
  {
    key: 'B',
    text: 'Gibt es ein weiteres Beispiel zur linearen Regression?',
    status: 'ACTIVE',
    up: 1,
    down: 0,
  },
  { key: 'C', text: 'Ist Kapitel 4 klausurrelevant?', status: 'PINNED', up: 3, down: 0 },
  {
    key: 'D',
    text: 'Müssen wir den vierten Abschnitt für die Prüfung lernen?',
    status: 'PENDING',
    up: 1,
    down: 0,
  },
  { key: 'E', text: 'Soll die Anwesenheit verpflichtend sein?', status: 'ACTIVE', up: 4, down: 4 },
  {
    key: 'F',
    text: 'Sollten wir eine Anwesenheitspflicht einführen?',
    status: 'PENDING',
    up: 2,
    down: 2,
  },
];
const PARTICIPANTS = 12;
if (process.env.APPROVE_ALL === '1')
  for (const q of SIX) if (q.status === 'PENDING') q.status = 'ACTIVE';
const now = () => performance.now();
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length
    ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)])
    : null;
};

async function setup() {
  const pub = createHttpTrpcSingle(TRPC_URL);
  const { code, hostToken, sessionId } = await pub.session.create.mutate({
    type: 'Q_AND_A',
    title: `Labor 4A ${new Date().toISOString()}`,
    moderationMode: true,
    allowCustomNicknames: true,
    nicknameTheme: 'HIGH_SCHOOL',
    anonymousMode: false,
    teamMode: false,
  });
  const host = createHttpTrpcSingle(TRPC_URL, hostToken);
  const participants = [];
  for (let i = 0; i < PARTICIPANTS; i += 1) {
    const j = await pub.session.join.mutate({
      code,
      nickname: `TN ${String(i + 1).padStart(2, '0')}`,
      anonymousClientId: crypto.randomUUID(),
      joinIdempotencyKey: crypto.randomUUID(),
    });
    participants.push({ participantId: j.participantId, cap: j.rejoinToken });
  }
  const questions = [];
  for (const [i, q] of SIX.entries()) {
    const p = participants[i];
    const c = createHttpTrpcSingle(TRPC_URL, undefined, undefined, undefined, p.cap);
    const r = await c.qa.submit.mutate({
      sessionId,
      participantId: p.participantId,
      text: q.text,
      idempotencyKey: crypto.randomUUID(),
    });
    questions.push({ ...q, id: r.id ?? r.question?.id });
  }
  // Erst freigeben, damit abgestimmt werden kann; Endstatus danach herstellen.
  for (const q of questions) {
    if (q.status !== 'PENDING')
      await host.qa.moderate.mutate({ sessionCode: code, questionId: q.id, action: 'APPROVE' });
  }
  const voteErrors = [];
  for (const q of questions.filter((x) => x.status !== 'PENDING')) {
    let idx = 0;
    for (let k = 0; k < q.up + q.down; k += 1) {
      const p = participants[(idx++ + 6) % PARTICIPANTS];
      const c = createHttpTrpcSingle(TRPC_URL, undefined, undefined, undefined, p.cap);
      try {
        await c.qa.vote.mutate({
          questionId: q.id,
          participantId: p.participantId,
          direction: k < q.up ? 'UP' : 'DOWN',
        });
      } catch (e) {
        voteErrors.push(`${q.key}: ${e.message}`);
      }
    }
  }
  for (const q of questions) {
    if (q.status === 'PINNED')
      await host.qa.moderate.mutate({ sessionCode: code, questionId: q.id, action: 'PIN' });
  }
  // PENDING-Fragen erhalten keine Stimmen (über die API nicht abstimmbar); dokumentierte Abweichung.
  const state = {
    code,
    hostToken,
    sessionId,
    participants,
    questions,
    voteErrors,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(
    JSON.stringify(
      { code, sessionId, questions: questions.map((q) => q.key + ':' + q.id), voteErrors },
      null,
      2,
    ),
  );
}

async function summary() {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const host = createHttpTrpcSingle(TRPC_URL, s.hostToken);
  const t0 = now();
  let first;
  try {
    first = await host.qa.requestSummary.mutate({ sessionId: s.sessionId, locale: 'de' });
  } catch (e) {
    console.log(JSON.stringify({ phase: 'request', error: e.message, ms: Math.round(now() - t0) }));
    return;
  }
  const tAck = now() - t0;
  let r = first.result;
  let polls = 0;
  while (r && r.status === 'pending' && now() - t0 < 400_000) {
    await new Promise((res) => setTimeout(res, 250));
    polls += 1;
    r = (await host.qa.summaryRuntime.query({ sessionId: s.sessionId })).result;
  }
  const out = {
    ackMs: Math.round(tAck),
    totalMs: Math.round(now() - t0),
    polls,
    status: r?.status,
    effectiveMode: r?.execution?.effectiveMode,
    attemptedMode: r?.execution?.attemptedMode,
    fallbackReason: r?.execution?.fallback?.reason ?? null,
    retry: r?.execution?.fallback?.retry ?? null,
    statements: (r?.statements ?? []).map(
      (x) => x.text ?? x.heading ?? JSON.stringify(x).slice(0, 160),
    ),
    sourceCount: r?.sources?.length ?? 0,
    snapshotHash: r?.snapshotHash?.slice(0, 12),
    modelVersion: r?.modelVersion ?? null,
  };
  console.log(JSON.stringify(out, null, 2));
}

async function hotpath() {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const pub = createHttpTrpcSingle(TRPC_URL);
  const n = Number(process.env.HOTPATH_N ?? 20);
  const join = [];
  const vote = [];
  const errors = [];
  const target = s.questions.find((q) => q.key === 'B');
  for (let i = 0; i < n; i += 1) {
    let t = now();
    try {
      const j = await pub.session.join.mutate({
        code: s.code,
        nickname: `HP ${Date.now() % 100000}-${i}`,
        anonymousClientId: crypto.randomUUID(),
        joinIdempotencyKey: crypto.randomUUID(),
      });
      join.push(now() - t);
      const c = createHttpTrpcSingle(TRPC_URL, undefined, undefined, undefined, j.rejoinToken);
      t = now();
      await c.qa.vote.mutate({
        questionId: target.id,
        participantId: j.participantId,
        direction: 'UP',
      });
      vote.push(now() - t);
    } catch (e) {
      errors.push(e.message);
    }
  }
  console.log(
    JSON.stringify({
      n,
      joinOk: join.length,
      voteOk: vote.length,
      errors: errors.slice(0, 3),
      joinP50: pct(join, 50),
      joinP95: pct(join, 95),
      voteP50: pct(vote, 50),
      voteP95: pct(vote, 95),
    }),
  );
}

// Themenanalyse (1.14c): Encoder-Cluster + optionale LLM-Labels. Ausgabe: Herkunft jedes Labels.
async function labels() {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const host = createHttpTrpcSingle(TRPC_URL, s.hostToken);
  const t0 = now();
  const r = await host.wordCloud.analyzeQa.mutate({
    sessionCode: s.code,
    mode: 'SEMANTIC',
    locale: 'de',
    metric: 'TOP',
    refresh: true,
  });
  console.log(
    JSON.stringify(
      {
        ms: Math.round(now() - t0),
        status: r.status,
        effectiveMode: r.effectiveMode,
        fallbackUsed: r.fallbackUsed,
        labelSettlement: r.labelSettlement ?? null,
        labelModelId: r.labelModelId ?? null,
        entries: r.entries.map((e) => ({
          label: e.label,
          origin: e.labelOrigin ?? null,
          members: e.memberCount ?? e.members.length,
        })),
      },
      null,
      2,
    ),
  );
}

function checkBinding(r, s, deletedId = null) {
  const byId = new Map(s.questions.map((q) => [q.id, q]));
  const srcIds = new Set((r?.sources ?? []).map((x) => x.id));
  const problems = [];
  for (const st of r?.statements ?? [])
    for (const id of st.sourceIds)
      if (!srcIds.has(id)) problems.push(`Aussage verweist auf unbekannte Quelle ${id}`);
  const mapped = [];
  for (const src of r?.sources ?? []) {
    const m = /qa-question:([0-9a-f-]{36})/.exec(src.id);
    const q = m ? byId.get(m[1]) : null;
    if (!q) {
      problems.push(`Quelle ${src.id} gehört nicht zur Session`);
      continue;
    }
    if (deletedId && q.id === deletedId) problems.push(`gelöschte Frage ${q.key} noch als Quelle`);
    mapped.push(`${q.key}${src.label.includes(q.text) ? '' : '(Text abweichend)'}`);
  }
  return { sources: mapped, problems };
}

async function binding() {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const host = createHttpTrpcSingle(TRPC_URL, s.hostToken);
  const r = (await host.qa.summaryRuntime.query({ sessionId: s.sessionId })).result;
  console.log(
    JSON.stringify({
      status: r?.status,
      reason: r?.execution?.fallback?.reason ?? null,
      statements: r?.statements?.length,
      ...checkBinding(r, s),
    }),
  );
}

// Gegenfall: Quelle (Frage E) während eines laufenden Modellauftrags löschen.
async function deleteDuring() {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const host = createHttpTrpcSingle(TRPC_URL, s.hostToken);
  const victim = s.questions.find((q) => q.key === (process.env.DELETE_KEY ?? 'E'));
  const t0 = now();
  const first = await host.qa.requestSummary.mutate({ sessionId: s.sessionId, locale: 'de' });
  await new Promise((res) => setTimeout(res, 1500));
  await host.qa.moderate.mutate({ sessionCode: s.code, questionId: victim.id, action: 'DELETE' });
  const tDel = now() - t0;
  let r = first.result;
  while (r && r.status === 'pending' && now() - t0 < 400_000) {
    await new Promise((res) => setTimeout(res, 500));
    r = (await host.qa.summaryRuntime.query({ sessionId: s.sessionId })).result;
  }
  console.log(
    JSON.stringify({
      deleted: victim.key,
      deletedAtMs: Math.round(tDel),
      totalMs: Math.round(now() - t0),
      status: r?.status,
      mode: r?.execution?.effectiveMode ?? null,
      reason: r?.execution?.fallback?.reason ?? null,
      ...checkBinding(r, s, victim.id),
    }),
  );
}

const run = { setup, summary, hotpath, labels, binding, deleteDuring }[mode];
if (!run) {
  console.error('mode: setup|summary|hotpath');
  process.exit(2);
}
await run();
