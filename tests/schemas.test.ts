import { describe, expect, it } from 'vitest';
import { incomingWebhookPayloadSchema } from '../api/http/schemas.js';

describe('incomingWebhookPayloadSchema', () => {
  it('aceita um payload válido, com timestamp opcional', () => {
    const result = incomingWebhookPayloadSchema.safeParse({
      messageId: 'msg-1',
      from: '+5511999998888',
      message: 'oi',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita quando falta um campo obrigatório', () => {
    const result = incomingWebhookPayloadSchema.safeParse({ from: '+5511999998888' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('messageId');
      expect(paths).toContain('message');
    }
  });

  it('rejeita campos string vazios', () => {
    const result = incomingWebhookPayloadSchema.safeParse({ messageId: '', from: '+55', message: 'oi' });
    expect(result.success).toBe(false);
  });
});
