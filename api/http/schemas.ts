import { z } from 'zod';

export const incomingWebhookPayloadSchema = z.object({
  messageId: z
    .string({ error: 'messageId é obrigatório e deve ser uma string não vazia' })
    .min(1, 'messageId é obrigatório e deve ser uma string não vazia'),
  from: z
    .string({ error: 'from é obrigatório e deve ser uma string não vazia' })
    .min(1, 'from é obrigatório e deve ser uma string não vazia'),
  message: z
    .string({ error: 'message é obrigatório e deve ser uma string não vazia' })
    .min(1, 'message é obrigatório e deve ser uma string não vazia'),
  timestamp: z
    .string({ error: 'timestamp, se enviado, deve ser uma string' })
    .min(1, 'timestamp, se enviado, não pode ser vazio')
    .optional(),
});

export type IncomingWebhookPayload = z.infer<typeof incomingWebhookPayloadSchema>;
