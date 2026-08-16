import type { Job, WebhookPayload } from './types.js';

export interface EnqueueResult {
  duplicate: boolean;
}

/**
 * Fila em memória com idempotência (mesmo messageId nunca é processado 2x) e
 * consumo sequencial (um job por vez), desacoplada do ciclo request/response.
 */
export class InMemoryQueue {
  private readonly pending: Job[] = [];
  private readonly seen = new Set<string>();
  private processing = false;

  constructor(private readonly onJob: (job: Job) => Promise<void>) {}

  enqueue(payload: WebhookPayload): EnqueueResult {
    if (this.seen.has(payload.messageId)) {
      return { duplicate: true };
    }

    this.seen.add(payload.messageId);
    this.pending.push({ ...payload, attempts: 0 });
    void this.drain();
    return { duplicate: false };
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      let job = this.pending.shift();
      while (job) {
        await this.onJob(job);
        job = this.pending.shift();
      }
    } finally {
      this.processing = false;
    }
  }
}
