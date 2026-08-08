'use strict';

process.env.PORT = '3010';
const app = require('../server');

const server = app.listen(3010);
const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Playwright nem sempre encaminha o sinal de encerramento ao processo filho no
// Windows. Este limite mantém o servidor estritamente temporário durante o E2E.
const forceStop = setTimeout(shutdown, 15_000);
forceStop.unref();
server.once('close', () => clearTimeout(forceStop));
