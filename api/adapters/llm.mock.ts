import type { LlmOutcome } from '../domain/types.js';

export interface CallLlmOptions {
  /** Só para testes: força o resultado e usa um delay curto, ignorando o aleatório. */
  forceOutcome?: LlmOutcome;
  minDelayMs?: number;
  maxDelayMs?: number;
  failureRate?: number;
}

/** Simula a chamada à API de LLM externa: delay variável e chance de falha. */
export async function callLlm(message: string, opts: CallLlmOptions = {}): Promise<string> {
  const { forceOutcome, minDelayMs = 500, maxDelayMs = 4500, failureRate = 0.15 } = opts;

  const delay = forceOutcome ? 20 : minDelayMs + Math.random() * (maxDelayMs - minDelayMs);
  await new Promise((resolve) => setTimeout(resolve, delay));

  const shouldFail = forceOutcome === 'fail' || (!forceOutcome && Math.random() < failureRate);
  if (shouldFail) {
    throw new Error('LLM externo indisponível ou timeout');
  }

  return `Resposta gerada para: "${message}"`;
}
