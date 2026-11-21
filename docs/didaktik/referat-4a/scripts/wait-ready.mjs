import { readFileSync } from 'node:fs';
import { createHttpTrpcSingle } from '../../../../scripts/load/lib/trpc-runtime.mjs';
const s = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const h = createHttpTrpcSingle('http://127.0.0.1:3000/trpc', s.hostToken);
for (;;) {
  const r = (await h.qa.summaryRuntime.query({ sessionId: s.sessionId })).result;
  if (!r || r.status !== 'pending') {
    console.log('ready', r?.status, r?.execution?.fallback?.reason);
    break;
  }
  await new Promise((x) => setTimeout(x, 1000));
}
