# Lexi — Webhook Assíncrono (PoC)

PoC que desacopla o recebimento do webhook do WhatsApp do processamento de um LLM externo, evitando que a Meta derrube a conexão por timeout durante negociações da Lexi.

## Stack

- Node.js + TypeScript
- Express
- Zod (validação do payload de entrada)
- Vitest + Supertest (testes)
- tsx (dev/execução sem etapa de build)

## Instruções de como rodar

```bash
npm install
npm run dev        # sobe o servidor em localhost:3000
npm run typecheck   # checagem de tipos
npm test             # suíte de testes
```

### Payload esperado pelo `POST /webhook`

```json
{
  "messageId": "msg-001",
  "from": "+5544999998888",
  "message": "Quero negociar minha dívida",
  "timestamp": "2026-08-16T12:00:00Z"
}
```

Campos obrigatórios: `messageId`, `from`, `message`. `timestamp` é opcional (se omitido, usa o horário de recebimento).

Resposta imediata (`202`), sem esperar o LLM:
```json
{ "status": "received", "messageId": "msg-001", "message": "Mensagem recebida e em processamento" }
```

Payload inválido retorna `400` com o detalhe de cada campo:
```json
{
  "status": "error",
  "message": "Payload inválido",
  "issues": [{ "path": "messageId", "message": "messageId é obrigatório e deve ser uma string não vazia" }]
}
```

### Testando manualmente

Tem uma coleção pronta em [`docs/lexi.postman_collection.json`](./docs/lexi.postman_collection.json), já com os cenários abaixo configurados. Ou via `curl` (com o servidor rodando em `npm run dev`):

```bash
# Envio real: delay e chance de falha genuínos do LLM mock
curl -X POST localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -d '{"messageId":"msg-001","from":"+5511999998888","message":"Quero negociar minha dívida"}'

# Falha forçada (esgota as 3 tentativas → fallback + DLQ)
curl -X POST localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -H 'x-force-llm-outcome: fail' \
  -d '{"messageId":"msg-002","from":"+5511999998888","message":"Quero negociar minha dívida"}'

# Payload inválido (400)
curl -X POST localhost:3000/webhook \
  -H 'Content-Type: application/json' \
  -d '{"from":"+5511999998888"}'

# Ver o que foi processado
curl localhost:3000/outbound-calls
curl localhost:3000/dead-letters
```

## Documentação técnica

### Arquitetura: Receber → Processar → Responder

```
Meta (WhatsApp)                    Este serviço                      Meta (WhatsApp)
      │                                  │                                  │
      │  POST /webhook  ───────────────► │                                  │
      │                                  │  enfileira (fila em memória)     │
      │ ◄─────────── 202 Accepted ────── │  (não espera o LLM)              │
      │                                  │                                  │
      │                                  │  worker processa em background:  │
      │                                  │    callLlm() com retry+backoff   │
      │                                  │                                  │
      │                                  │  POST /mock-whatsapp-send ─────► │
      │                                  │  (chamada de saída, outra conexão)│
```

`POST /webhook` (entrada, síncrona) e `POST /mock-whatsapp-send` (saída, simula a API real do WhatsApp recebendo o envio) são duas conexões HTTP independentes — a chave do desacoplamento.

#### Organização do código: Ports & Adapters

```
api/
  domain/      regra de negócio (types, queue, worker)
  adapters/    implementações trocáveis (llm.mock, whatsapp.mock)
  http/        rotas Express + validação de entrada
  shared/      utilitário (mascarar logs)
  server.ts    bootstrap
```

`domain/` nunca importa de `http/` nem de `adapters/`, só o contrário — por isso dá pra testar todo o retry/DLQ (`tests/worker.test.ts`) sem servidor nem rede, e trocar o LLM/WhatsApp mock por uma integração real em produção mexeria só em `adapters/`.

#### Fluxo de retry

- 3 tentativas de chamada ao LLM, com timeout de 3s por tentativa
- Backoff exponencial entre tentativas: 500ms → 1000ms → 2000ms
- Se uma tentativa tiver sucesso: outbound call com a resposta real (`kind: "success"`)
- Se esgotar as 3 tentativas: outbound call de fallback pro cliente (`kind: "fallback"`) + o job vai para uma Dead Letter Queue (DLQ) em memória — **nunca** é reenfileirado na fila principal

#### Idempotência

A Meta pode reenviar o mesmo webhook se não receber `200`/`202` a tempo. A fila mantém um `Set` de `messageId` já vistos — reenvio do mesmo `messageId` retorna `202` normalmente, mas não gera um segundo processamento nem uma segunda resposta ao cliente.

#### Hook de teste

O header `x-force-llm-outcome: success | fail` força o resultado do LLM mock (ignorando o aleatório), usado pelos testes de integração para exercitar os caminhos de sucesso e de fallback + DLQ. Em produção, esse hook não existiria.

### Logs

Dados sensíveis (telefone, conteúdo da negociação) nunca aparecem em texto claro nos logs — nem nos endpoints de debug. Convenção:

```
[WEBHOOK] recebido messageId=msg-001 from=+*********8888 text=<27 chars omitidos> duplicado=false
[WORKER] tentativa 1/3 messageId=msg-001 from=+*********8888 text=<27 chars omitidos>
[WORKER] falha na tentativa 1/3 messageId=msg-001 erro=LLM externo indisponível ou timeout
[WORKER] sucesso na tentativa 2 messageId=msg-001
[OUTBOUND WHATSAPP] messageId=msg-001 to=+*********8888 kind=success
[MOCK WHATSAPP API] mensagem enviada messageId=msg-001 to=+*********8888 kind=success
```

Em produção, trocaríamos `console.log` por um logger estruturado gerando JSON com `level`/`timestamp`/`traceId`, para correlacionar os logs de uma mesma negociação em uma ferramenta como CloudWatch/Datadog/ELK.

### Testes

- `tests/mask.test.ts` — `maskPhone`/`maskText` mascaram corretamente
- `tests/worker.test.ts` — `processJob` com dependências injetadas: sucesso na 1ª tentativa, retry até sucesso, esgota tentativas → fallback + DLQ, exclusividade success/fallback
- `tests/webhook.test.ts` — resposta rápida (não espera o LLM), payload inválido → 400, idempotência (mesmo `messageId` não duplica), fluxo completo de falha → fallback + DLQ

### O que ficou de fora

- **Testes de concorrência** — o worker processa um job por vez, não há teste de múltiplos workers/paralelismo, que exigiria configuração da infra.
- **Logger estruturado** — `console.log` com prefixo é suficiente pra uma PoC local. Em produção usaria Pino/Winston.
- **Persistência da fila/DLQ** — tudo em memória e um restart do processo perde jobs pendentes e a DLQ.
- **Reprocessamento da DLQ** — só permite a leitura (`GET /dead-letters`). Em produção um operador aciona o reenvio das mensagens da DLQ de volta pra fila principal depois de confirmar que o problema foi resolvido.

## ADR (Architecture Decision Record)

### ADR-001: Mecanismo de fila

**Contexto:** a PoC precisa desacoplar o recebimento do webhook do processamento do LLM, sem depender de infraestrutura externa (restrição do desafio) e rodando localmente.

**Decisão:** fila em memória, com um worker que drena um job por vez.

**Alternativas consideradas:**
| Tecnologia | Prós | Contras |
|---|---|---|
| **Amazon SQS** | Gerenciado, DLQ nativa (`RedrivePolicy`), `visibility timeout` resolve worker morrendo no meio | *At-least-once delivery* (duplicatas possíveis), FIFO reduz throughput |
| **RabbitMQ** | Controle fino de roteamento, DLQ nativa | Precisa operar/manter cluster |
| **Kafka** | Bom para volume muito grande, replay de eventos | Overkill pro caso, DLQ não é conceito nativo (é mais streaming que fila de tarefas) |

Em produção, a escolha seria **Amazon SQS**: resolve DLQ e retry nativamente, e o modelo *at-least-once* dele conecta bem com o próprio comportamento de reenvio de webhook da Meta — ambos exigem idempotência do lado do consumidor de qualquer forma.

**Consequências:** a fila em memória não é durável (perde jobs num restart) e não escala horizontalmente (um único processo), mas é suficiente para provar o conceito de desacoplamento.

### ADR-002: Estratégia de retry e DLQ

**Contexto:** o LLM externo pode falhar ou demorar, e o cliente não pode ficar sem retorno numa negociação sensível de dívida.

**Decisão:** retry com backoff exponencial (3 tentativas: 500ms, 1000ms, 2000ms), timeout de 3s por tentativa. Ao esgotar as tentativas: uma chamada de outbound de fallback (mensagem de instabilidade) + o job vai para uma DLQ separada, nunca é reenfileirado na fila principal (evitaria efeito cascata numa API já instável).

**Mapeamento PoC → produção (SQS):**
| Conceito na PoC | Equivalente em produção |
|---|---|
| Array em memória | Fila SQS |
| Loop de retry com contador | `maxReceiveCount` na `RedrivePolicy` |
| Esgotou, adiciona em outro array | SQS move automaticamente para a DLQ configurada |
| Backoff manual com `setTimeout` | Visibility timeout crescente / backoff configurável |
| Log da falha | CloudWatch Alarm na métrica da DLQ |

**Consequências:** o usuário sempre recebe algum retorno (sucesso ou fallback), mas isso exige monitoramento humano da DLQ — sem alguém observando essa fila, mensagens falhas caem silenciosamente e recriam o mesmo problema do incidente original, só que escondido atrás da DLQ.
