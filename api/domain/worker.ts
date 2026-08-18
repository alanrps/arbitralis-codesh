import type { DeadLetterItem, Job, LlmOutcome, OutboundCallRecord } from './types.js';
import { maskPhone, maskText } from '../shared/mask.js';

const DEFAULT_BACKOFF_MS = [500, 1000, 2000];
const DEFAULT_ATTEMPT_TIMEOUT_MS = 3000;
const FALLBACK_TEXT = 'Estamos com instabilidade no momento, vamos retomar sua negociação em breve.';

export interface WorkerDeps {
  /** Porta pro LLM externo — quem chama processJob decide qual implementação usar. */
  callLlm: (message: string, opts?: { forceOutcome?: LlmOutcome }) => Promise<string>;
  /** Porta pro envio de saída (WhatsApp) — idem. */
  sendWhatsAppMessage: (record: OutboundCallRecord) => Promise<void>;
  maxAttempts?: number;
  attemptTimeoutMs?: number;
  backoffMs?: number[];
  onOutbound?: (record: OutboundCallRecord) => void;
  onDeadLetter?: (item: DeadLetterItem) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Orquestra o processamento de um job: LLM (com retry + backoff + timeout) e o
 * outbound call de resposta. Nunca reenfileira na fila principal ao esgotar
 * as tentativas — vai para outbound de fallback + DLQ.
 */
export async function processJob(job: Job, deps: WorkerDeps): Promise<void> {
  const { callLlm, sendWhatsAppMessage } = deps;
  const backoffMs = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
  const maxAttempts = deps.maxAttempts ?? backoffMs.length;
  const attemptTimeoutMs = deps.attemptTimeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;

  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(
      `[WORKER] tentativa ${attempt}/${maxAttempts} messageId=${job.messageId} from=${maskPhone(job.from)} text=${maskText(job.message)}`,
    );

    try {
      const llmOptions = job.forceOutcome ? { forceOutcome: job.forceOutcome } : {};
      const reply = await withTimeout(callLlm(job.message, llmOptions), attemptTimeoutMs);

      console.log(`[WORKER] sucesso na tentativa ${attempt} messageId=${job.messageId}`);

      const record: OutboundCallRecord = {
        messageId: job.messageId,
        to: job.from,
        kind: 'success',
        text: reply,
        at: new Date().toISOString(),
      };
      console.log(`[OUTBOUND WHATSAPP] messageId=${record.messageId} to=${maskPhone(record.to)} kind=${record.kind}`);
      await sendWhatsAppMessage(record);
      deps.onOutbound?.(record);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.log(`[WORKER] falha na tentativa ${attempt}/${maxAttempts} messageId=${job.messageId} erro=${lastError}`);

      if (attempt < maxAttempts) {
        const wait = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 0;
        await sleep(wait);
      }
    }
  }

  console.log(`[WORKER] job movido para DLQ messageId=${job.messageId} ultimoErro=${lastError}`);

  const fallbackRecord: OutboundCallRecord = {
    messageId: job.messageId,
    to: job.from,
    kind: 'fallback',
    text: FALLBACK_TEXT,
    at: new Date().toISOString(),
  };
  console.log(`[OUTBOUND WHATSAPP] messageId=${fallbackRecord.messageId} to=${maskPhone(fallbackRecord.to)} kind=${fallbackRecord.kind}`);

  try {
    await sendWhatsAppMessage(fallbackRecord);
    deps.onOutbound?.(fallbackRecord);
  } catch (sendError) {
    const sendErrorMessage = sendError instanceof Error ? sendError.message : String(sendError);
    console.log(`[WORKER] falha ao enviar outbound de fallback messageId=${job.messageId} erro=${sendErrorMessage}`);
    lastError = `${lastError}; envio de saída falhou: ${sendErrorMessage}`;
  }

  deps.onDeadLetter?.({ job, lastError, failedAt: new Date().toISOString() });
}
