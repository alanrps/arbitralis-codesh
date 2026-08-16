import { Router } from 'express';
import type { Request, Response } from 'express';
import { InMemoryQueue } from '../domain/queue.js';
import { processJob } from '../domain/worker.js';
import { callLlm } from '../adapters/llm.mock.js';
import { sendWhatsAppMessage } from '../adapters/whatsapp.mock.js';
import { maskPhone, maskText } from '../shared/mask.js';
import { incomingWebhookPayloadSchema } from './schemas.js';
import type { DeadLetterItem, Job, OutboundCallRecord, WebhookPayload } from '../domain/types.js';

export const router = Router();

const outboundCalls: OutboundCallRecord[] = [];
const deadLetters: DeadLetterItem[] = [];

const queue = new InMemoryQueue((job: Job) =>
  processJob(job, {
    callLlm,
    sendWhatsAppMessage,
    onOutbound: (record) => outboundCalls.push(record),
    onDeadLetter: (item) => deadLetters.push(item),
  }),
);

router.post('/webhook', (req: Request, res: Response) => {
  const parsed = incomingWebhookPayloadSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      status: 'error',
      message: 'Payload inválido',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
    return;
  }

  const forceHeader = req.header('x-force-llm-outcome');
  const payload: WebhookPayload = {
    messageId: parsed.data.messageId,
    from: parsed.data.from,
    message: parsed.data.message,
    timestamp: parsed.data.timestamp ?? new Date().toISOString(),
  };
  if (forceHeader === 'success' || forceHeader === 'fail') {
    payload.forceOutcome = forceHeader;
  }

  const { duplicate } = queue.enqueue(payload);
  console.log(
    `[WEBHOOK] recebido messageId=${payload.messageId} from=${maskPhone(payload.from)} text=${maskText(payload.message)} duplicado=${duplicate}`,
  );

  res.status(202).json({
    status: 'received',
    messageId: payload.messageId,
    message: 'Mensagem recebida e em processamento',
  });
});

router.post('/mock-whatsapp-send', (req: Request, res: Response) => {
  const record = req.body as OutboundCallRecord;
  console.log(
    `[MOCK WHATSAPP API] mensagem enviada messageId=${record.messageId} to=${maskPhone(record.to)} kind=${record.kind}`,
  );
  res.status(200).json({ status: 'ok' });
});

router.get('/outbound-calls', (_req: Request, res: Response) => {
  res.status(200).json(
    outboundCalls.map((record) => ({
      messageId: record.messageId,
      to: maskPhone(record.to),
      kind: record.kind,
      textPreview: maskText(record.text),
      at: record.at,
    })),
  );
});

router.get('/dead-letters', (_req: Request, res: Response) => {
  res.status(200).json(
    deadLetters.map((item) => ({
      messageId: item.job.messageId,
      from: maskPhone(item.job.from),
      lastError: item.lastError,
      failedAt: item.failedAt,
    })),
  );
});
