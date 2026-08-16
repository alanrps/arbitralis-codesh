import { fileURLToPath } from 'node:url';
import express from 'express';
import { router } from './http/routes.js';

export const app = express();
app.use(express.json());
app.use(router);

const port = Number(process.env.PORT ?? 3000);
const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  app.listen(port, () => {
    console.log(`Lexi PoC ouvindo na porta ${port}`);
  });
}
