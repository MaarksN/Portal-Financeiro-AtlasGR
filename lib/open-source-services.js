'use strict';

const { Queue } = require('bullmq');
const NodeClam = require('clamscan');
const Redis = require('ioredis');
const Minio = require('minio');

function createQueue(name = 'portal-financeiro') {
  const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
  });
  return new Queue(name, { connection });
}

function createObjectStorage() {
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'portal-financeiro',
    secretKey: process.env.MINIO_SECRET_KEY || 'change-this-minio-password',
  });
}

async function createAntivirusScanner() {
  return new NodeClam().init({
    clamdscan: {
      host: process.env.CLAMAV_HOST || '127.0.0.1',
      port: Number(process.env.CLAMAV_PORT || 3310),
      timeout: 60_000,
      localFallback: false,
    },
    preference: 'clamdscan',
  });
}

async function discoverIdentityProvider() {
  if (!process.env.OIDC_ISSUER || !process.env.OIDC_CLIENT_ID) return null;
  const { discovery } = await import('openid-client');
  return discovery(
    new URL(process.env.OIDC_ISSUER),
    process.env.OIDC_CLIENT_ID,
    process.env.OIDC_CLIENT_SECRET,
  );
}

module.exports = {
  createAntivirusScanner,
  createObjectStorage,
  createQueue,
  discoverIdentityProvider,
};
