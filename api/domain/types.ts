export interface Message {
  messageId: string;
  from: string;
  message: string;
  timestamp: string;
}

export type LlmOutcome = 'success' | 'fail';

export interface WebhookPayload extends Message {
  /** Hook só para testes determinísticos: força sucesso/falha do LLM mock, ignorando o aleatório. */
  forceOutcome?: LlmOutcome;
}

export interface Job extends WebhookPayload {
  attempts: number;
}

export type OutboundKind = 'success' | 'fallback';

export interface OutboundCallRecord {
  messageId: string;
  to: string;
  kind: OutboundKind;
  text: string;
  at: string;
}

export interface DeadLetterItem {
  job: Job;
  lastError: string;
  failedAt: string;
}
