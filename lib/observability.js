'use strict';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { NodeSDK } = require('@opentelemetry/sdk-node');

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'portal-financeiro-atlasgr',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  process.once('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
