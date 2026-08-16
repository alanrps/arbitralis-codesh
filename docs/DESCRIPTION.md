# Contexto

A Arbitralis opera uma plataforma de resolução extrajudicial de conflitos. Um dos principais produtos é a Lexi, um agente de negociação por IA que atua via WhatsApp. Ela recebe o contato, processa a intenção batendo em uma API de LLM externa e conduz o fluxo até um acordo.

## O Incidente

Atualmente, o fluxo é processado de forma síncrona. Um cliente interno (Suporte) abriu o seguinte relato:

> Com o aumento do volume de acordos, a API do LLM começou a apresentar lentidão. Como o webhook aguarda a resposta na mesma requisição HTTP, a Meta (WhatsApp) dá timeout e corta a conexão. Mensagens estão sendo perdidas no meio de negociações sensíveis, e a confiança do usuário despenca.

## O Desafio

Construa, do absoluto zero, uma Prova de Conceito (PoC) de uma API para simular um fluxo de recebimento não-bloqueante. O sistema deve receber o webhook, desacoplar o processamento do LLM e simular a devolução da mensagem.

Não há código-base. Você define a estrutura a partir do primeiro arquivo.

## O Que Esperamos Ver

### Código Funcional e Simples

- Um endpoint `POST /webhook` que recebe o payload simulado
- Um mecanismo para desacoplar a requisição HTTP da lentidão do LLM (simule o LLM com um `sleep`/`setTimeout` que ocasionalmente demora ou falha)
- Um log ou mock mostrando o disparo da resposta final de volta ao usuário

### Clarificações Técnicas

- **Payload mínimo**: inclua no README um exemplo do payload esperado pelo `POST /webhook`
- **Retorno assíncrono**: simule a "devolução da mensagem" como um disparo de saída (Outbound Call) para uma API de envio de mensagens do WhatsApp, reforçando a arquitetura de duas etapas: **Receber (Sync) → Processar (Async) → Responder (Outbound Call)**

### Testes Automatizados

Cobertura dos cenários principais e fluxos de erro (ex: falha do LLM).

### Documentação (Linguagem de Gente)

- `README.md` claro com instruções de como rodar o projeto
- Explicação das escolhas feitas e o que foi deixado de fora

### Arquitetura, Resiliência e Trade-offs

Um ADR (Architecture Decision Record) no `README.md`:

- Se você usou uma fila em memória na PoC, qual tecnologia usaria em produção e por quê?
- Como o sistema lidaria com retries ou Dead Letter Queues (DLQ)?

## Restrições

- **Stack**: Node.js, TypeScript, Python, Go ou Kotlin
- **Setup**: Use frameworks padrão (Express, Fastify, FastAPI, Flask, etc.)
- Não use bancos de dados complexos; mantenha estado em memória para a PoC
- **Dados sensíveis**: lembre-se que tratamos de dívidas e conflitos — evite logar PII em texto claro
- Ferramentas de AI Coding (Claude Code, Cursor, Copilot) são encorajadas — avaliaremos seu julgamento crítico sobre quando confiar e como validar o que a IA gerou

## O Que Entregar

Um link para um repositório público no GitHub com o código-fonte, testes e `README.md`.
