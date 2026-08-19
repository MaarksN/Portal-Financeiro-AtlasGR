// Ponto de entrada do Cron Job mensal (ver render.yaml - roda todo dia 1).
// Execucao manual: npm run billing:run

const logger = require("../integracao_d4sign/logger");
const { runMonthlyBilling } = require("../integracao_d4sign/services/billingService");

runMonthlyBilling()
  .then((summary) => {
    logger.info("Cobranca mensal concluida:", JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    logger.error("Cobranca mensal falhou:", err);
    process.exit(1);
  });
