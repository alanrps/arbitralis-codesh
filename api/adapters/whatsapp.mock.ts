import type { OutboundCallRecord } from '../domain/types.js';

export interface SendWhatsAppMessageOptions {
  baseUrl?: string;
}

/**
 * Simula o envio de saída para a API do WhatsApp: uma chamada HTTP real e
 * separada para /mock-whatsapp-send, reforçando que é uma conexão distinta
 * da que recebeu o webhook.
 */
export async function sendWhatsAppMessage(
  record: OutboundCallRecord,
  opts: SendWhatsAppMessageOptions = {},
): Promise<void> {
  const baseUrl = opts.baseUrl ?? process.env.WHATSAPP_MOCK_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;

  const response = await fetch(`${baseUrl}/mock-whatsapp-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    throw new Error(`Falha ao chamar /mock-whatsapp-send: ${response.status}`);
  }
}
