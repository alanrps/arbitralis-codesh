import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../api/server.js';

let server: Server;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  process.env.WHATSAPP_MOCK_URL = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server.close();
});

function samplePayload(overrides: Record<string, unknown> = {}) {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2)}`,
    from: '+5511999998888',
    message: 'Quero negociar minha dívida',
    timestamp: '2026-08-16T12:00:00Z',
    ...overrides,
  };
}

interface DebugOutbound {
  messageId: string;
  kind: 'success' | 'fallback';
}

async function waitForOutbound(messageId: string, timeoutMs = 8000): Promise<DebugOutbound> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get('/outbound-calls');
    const body = res.body as DebugOutbound[];
    const found = body.find((r) => r.messageId === messageId);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`outbound call para ${messageId} não apareceu a tempo`);
}

describe('POST /webhook', () => {
  it('responde rápido (202) sem esperar o LLM terminar', async () => {
    // Força um resultado rápido em background: este teste só verifica a resposta HTTP
    // imediata, e um job real (aleatório) aqui poderia "empatar" a fila sequencial e
    // atrasar os testes seguintes, que competem pela mesma instância de InMemoryQueue.
    const payload = samplePayload();
    const start = Date.now();
    const res = await request(app).post('/webhook').set('x-force-llm-outcome', 'success').send(payload);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      status: 'received',
      messageId: payload.messageId,
      message: 'Mensagem recebida e em processamento',
    });
    expect(elapsed).toBeLessThan(150);
  });

  it('rejeita payload inválido com 400 e detalha os campos com problema', async () => {
    const res = await request(app).post('/webhook').send({ from: '+5511999998888' });
    expect(res.status).toBe(400);

    const body = res.body as { status: string; issues: Array<{ path: string; message: string }> };
    expect(body.status).toBe('error');
    const paths = body.issues.map((issue) => issue.path);
    expect(paths).toContain('messageId');
    expect(paths).toContain('message');
  });

  it('não duplica processamento quando a Meta reenvia o mesmo messageId', async () => {
    const payload = samplePayload({ messageId: 'msg-idempotente' });

    await request(app).post('/webhook').set('x-force-llm-outcome', 'success').send(payload);
    await request(app).post('/webhook').set('x-force-llm-outcome', 'success').send(payload);

    await waitForOutbound(payload.messageId);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const res = await request(app).get('/outbound-calls');
    const body = res.body as DebugOutbound[];
    const matches = body.filter((r) => r.messageId === payload.messageId);
    expect(matches).toHaveLength(1);
  });

  it('quando o LLM falha sempre, aciona fallback e move o job para a DLQ', async () => {
    const payload = samplePayload({ messageId: 'msg-falha-total' });

    await request(app).post('/webhook').set('x-force-llm-outcome', 'fail').send(payload);

    const outbound = await waitForOutbound(payload.messageId);
    expect(outbound.kind).toBe('fallback');

    const dlqRes = await request(app).get('/dead-letters');
    const dlqEntries = dlqRes.body as Array<{ messageId: string }>;
    expect(dlqEntries.some((entry) => entry.messageId === payload.messageId)).toBe(true);
  });
});
