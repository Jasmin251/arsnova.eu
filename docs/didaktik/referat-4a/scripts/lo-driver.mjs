// Lernziel-Versuch 4A: bestätigte/manuelle Session-Lernziele vs. Ableitung bei gestörter Runtime.
// Nutzung: node lo-driver.mjs setup | derive | show   (STATE: lo-state.json)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHttpTrpcSingle } from '../../../../scripts/load/lib/trpc-runtime.mjs';

const TRPC_URL = 'http://127.0.0.1:3000/trpc';
import { fileURLToPath } from 'node:url';
const L = fileURLToPath(new URL('./.state', import.meta.url));
// Arbeitskopie des untersuchten Stands (z. B. git worktree auf 85ebdb8c); Default: dieses Repo
const W = process.env.ARSNOVA_DIR ?? fileURLToPath(new URL('../../../../', import.meta.url));
mkdirSync(L, { recursive: true });
const STATE = `${L}/lo-state.json`;
const mode = process.argv[2];

function demoPayload() {
  const raw = JSON.parse(
    readFileSync(`${W}/apps/frontend/src/assets/demo/quiz-demo-showcase.de.json`, 'utf8'),
  );
  const quiz = raw.quiz;
  const questions = quiz.questions.slice(0, 4).map((q) => {
    const s = { ...q };
    if (s.numericTolerancePercent === null) delete s.numericTolerancePercent;
    return s;
  });
  return {
    historyScopeId: crypto.randomUUID(),
    name: `Labor 4A Lernziele ${Date.now()}`,
    description: quiz.description,
    motifImageUrl: quiz.motifImageUrl ?? null,
    showLeaderboard: quiz.showLeaderboard,
    allowCustomNicknames: quiz.allowCustomNicknames,
    defaultTimer: quiz.defaultTimer ?? null,
    timerScaleByDifficulty: quiz.timerScaleByDifficulty ?? true,
    enableSoundEffects: quiz.enableSoundEffects,
    enableRewardEffects: quiz.enableRewardEffects,
    enableMotivationMessages: quiz.enableMotivationMessages,
    enableEmojiReactions: quiz.enableEmojiReactions,
    anonymousMode: quiz.anonymousMode,
    teamMode: quiz.teamMode,
    teamCount: quiz.teamCount ?? null,
    teamAssignment: quiz.teamAssignment ?? 'AUTO',
    teamNames: quiz.teamNames ?? [],
    backgroundMusic: quiz.backgroundMusic ?? null,
    nicknameTheme: quiz.nicknameTheme,
    bonusTokenCount: quiz.bonusTokenCount ?? null,
    readingPhaseEnabled: quiz.readingPhaseEnabled ?? true,
    preset: 'PLAYFUL',
    questions,
  };
}

const brief = (snap) =>
  snap.objectives.map((o) => ({
    id: o.objectiveId ?? o.id,
    text: o.text,
    state: o.confirmation?.state ?? null,
    origin: o.origin?.kind ?? o.origin ?? null,
    rev: o.revision ?? null,
  }));

async function setup() {
  const pub = createHttpTrpcSingle(TRPC_URL);
  const { quizId } = await pub.quiz.upload.mutate(demoPayload());
  const { code, hostToken, sessionId } = await pub.session.create.mutate({ quizId, type: 'QUIZ' });
  const host = createHttpTrpcSingle(TRPC_URL, hostToken);
  let snap = await host.session.getLearningObjectives.query({ code });
  const confirmedId = crypto.randomUUID();
  const draftId = crypto.randomUUID();
  snap = await host.session.saveLearningObjectives.mutate({
    code,
    expectedLearningContextRevision: snap.learningContextRevision,
    mutations: [
      {
        action: 'upsert',
        objectiveId: confirmedId,
        expectedRevision: null,
        text: 'Die Studierenden können die Grundidee der Fallstudie in eigenen Worten erklären.',
        scope: { kind: 'session' },
        confirmationState: 'confirmed',
      },
      {
        action: 'upsert',
        objectiveId: draftId,
        expectedRevision: null,
        text: 'Die Studierenden können zwei Beispiele aus dem Quiz einordnen.',
        scope: { kind: 'session' },
        confirmationState: 'draft',
      },
    ],
  });
  writeFileSync(
    STATE,
    JSON.stringify({ code, hostToken, sessionId, quizId, confirmedId, draftId }, null, 2),
  );
  console.log(JSON.stringify({ code, objectives: brief(snap) }, null, 2));
}

async function derive() {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const host = createHttpTrpcSingle(TRPC_URL, s.hostToken);
  const before = await host.session.getLearningObjectives.query({ code: s.code });
  const t0 = performance.now();
  let res;
  try {
    res = await host.session.deriveLearningObjectives.mutate({
      code: s.code,
      operationId: crypto.randomUUID(),
      expectedLearningContextRevision: before.learningContextRevision,
      maximumDrafts: 3,
      locale: 'de',
    });
  } catch (e) {
    res = { status: 'error', message: e.message };
  }
  const ms = Math.round(performance.now() - t0);
  const after = await host.session.getLearningObjectives.query({ code: s.code });
  const b = brief(before);
  const a = brief(after);
  const keep = (id) =>
    JSON.stringify(b.find((o) => o.id === id)) === JSON.stringify(a.find((o) => o.id === id));
  console.log(
    JSON.stringify({
      ms,
      status: res.status,
      retry: res.retry ?? null,
      appliedCount: res.appliedCount ?? null,
      message: res.message ?? null,
      before: b.length,
      after: a.length,
      confirmedUnchanged: keep(s.confirmedId),
      draftUnchanged: keep(s.draftId),
      newObjectives: a
        .filter((o) => !b.some((x) => x.id === o.id))
        .map((o) => `${o.state}:${o.text}`),
    }),
  );
}

async function show() {
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const host = createHttpTrpcSingle(TRPC_URL, s.hostToken);
  console.log(
    JSON.stringify(
      brief(await host.session.getLearningObjectives.query({ code: s.code })),
      null,
      2,
    ),
  );
}

await (
  { setup, derive, show }[mode] ??
  (() => {
    console.error('setup|derive|show');
    process.exit(2);
  })
)();
