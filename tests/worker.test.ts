import { describe, expect, it, vi } from 'vitest';
import { processJob } from '../api/domain/worker.js';
import type { Job, OutboundCallRecord } from '../api/domain/types.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    messageId: 'msg-test',
    from: '+5511999998888',
    message: 'teste',
    timestamp: new Date().toISOString(),
    attempts: 0,
    ...overrides,
  };
}

describe('processJob', () => {
  it('chama o outbound de sucesso já na 1ª tentativa quando o LLM responde', async () => {
    const callLlm = vi.fn().mockResolvedValue('resposta ok');
    const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined);

    await processJob(makeJob(), { callLlm, sendWhatsAppMessage, backoffMs: [1, 1] });

    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const record = sendWhatsAppMessage.mock.calls[0]?.[0] as OutboundCallRecord;
    expect(record.kind).toBe('success');
  });

  it('tenta de novo após falha e sucede na 2ª tentativa', async () => {
    const callLlm = vi
      .fn()
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce('resposta ok');
    const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined);

    await processJob(makeJob(), { callLlm, sendWhatsAppMessage, backoffMs: [1, 1] });

    expect(callLlm).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const record = sendWhatsAppMessage.mock.calls[0]?.[0] as OutboundCallRecord;
    expect(record.kind).toBe('success');
  });

  it('esgota as tentativas, chama outbound de fallback e move para DLQ', async () => {
    const callLlm = vi.fn().mockRejectedValue(new Error('sempre falha'));
    const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined);
    const onDeadLetter = vi.fn();

    await processJob(makeJob(), {
      callLlm,
      sendWhatsAppMessage,
      onDeadLetter,
      maxAttempts: 3,
      backoffMs: [1, 1, 1],
    });

    expect(callLlm).toHaveBeenCalledTimes(3);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const record = sendWhatsAppMessage.mock.calls[0]?.[0] as OutboundCallRecord;
    expect(record.kind).toBe('fallback');
    expect(onDeadLetter).toHaveBeenCalledTimes(1);
  });

  it('nunca chama outbound de sucesso e de fallback ao mesmo tempo', async () => {
    const callLlm = vi.fn().mockResolvedValue('ok');
    const sendWhatsAppMessage = vi.fn().mockResolvedValue(undefined);

    await processJob(makeJob(), { callLlm, sendWhatsAppMessage, backoffMs: [1, 1] });

    const kinds = sendWhatsAppMessage.mock.calls.map((call) => (call[0] as OutboundCallRecord).kind);
    expect(new Set(kinds).size).toBe(1);
  });

  it('quando o envio do fallback também falha, não lança exceção e ainda move pra DLQ', async () => {
    const callLlm = vi.fn().mockRejectedValue(new Error('sempre falha'));
    const sendWhatsAppMessage = vi.fn().mockRejectedValue(new Error('WhatsApp API fora do ar'));
    const onDeadLetter = vi.fn();

    await expect(
      processJob(makeJob(), { callLlm, sendWhatsAppMessage, onDeadLetter, maxAttempts: 2, backoffMs: [1, 1] }),
    ).resolves.toBeUndefined();

    expect(onDeadLetter).toHaveBeenCalledTimes(1);
    expect(onDeadLetter.mock.calls[0]?.[0].lastError).toContain('WhatsApp API fora do ar');
  });
});
