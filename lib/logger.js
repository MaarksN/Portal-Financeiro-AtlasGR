'use strict';

const path = require('path');
const pino = require('pino');
const pinoHttp = require('pino-http');

const level = process.env.LOG_LEVEL || 'info';
const streams = [
  { stream: process.stdout },
  { stream: pino.destination({ dest: path.join(__dirname, '..', 'server.log'), mkdir: true, sync: false }) },
];

const logger = pino({
  level,
  base: { service: 'portal-financeiro-atlasgr' },
  timestamp: pino.stdTimeFunctions.isoTime,
}, pino.multistream(streams));

const httpLogger = pinoHttp({
  logger,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
});

module.exports = { httpLogger, logger };
