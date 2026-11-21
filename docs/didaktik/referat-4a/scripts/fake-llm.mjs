// Fault-Injection-Adapter (nur Labor): imitiert llama-server, liefert aber ungültige Modellausgaben.
// FAULT=garbage  -> HTTP 200, Inhalt ist kein JSON
// FAULT=schema   -> HTTP 200, gültiges JSON, das den Ausgabevertrag verletzt (erfundene Quellen-ID)
import { createServer } from 'node:http';

const FAULT = process.env.FAULT ?? 'garbage';
const PORT = Number(process.env.PORT ?? 8081);
let calls = 0;

createServer((req, res) => {
  if (req.url?.startsWith('/slots')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ id: 0, is_processing: false }]));
    return;
  }
  if (req.url?.startsWith('/v1/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls += 1;
      const content =
        FAULT === 'garbage'
          ? 'Hier ist deine Zusammenfassung: ¯\\_(ツ)_/¯ (kein JSON)'
          : JSON.stringify({ topics: [{ heading: 'Erfunden', sourceRefs: ['q999'] }] });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: `fake-${calls}`,
          object: 'chat.completion',
          model: 'fault-injection',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        }),
      );
      console.log(`call ${calls} (${FAULT})`);
    });
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`fake-llm ${FAULT} on ${PORT}`));
