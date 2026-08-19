require("dotenv").config();

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  internalWebhookSecret: required("INTERNAL_WEBHOOK_SECRET"),

  auth: {
    user: required("ADMIN_USER", "admin"),
    password: required("ADMIN_PASSWORD"),
    sessionSecret: required("SESSION_SECRET") || required("INTERNAL_WEBHOOK_SECRET") || "atlas-dev-secret-troque-isto",
  },

  bitrix: {
    webhookUrl: required("BITRIX_WEBHOOK_URL"),
    categoryId: process.env.BITRIX_CATEGORY_ID || null,
    stageTrigger: required("BITRIX_STAGE_TRIGGER"),
    stageSent: required("BITRIX_STAGE_SENT"),
    stageSigned: required("BITRIX_STAGE_SIGNED"),
    stageCancelled: required("BITRIX_STAGE_CANCELLED"),
    stageWonForBilling: required("BITRIX_STAGE_WON_FOR_BILLING"),
  },

  d4sign: {
    baseUrl: required("D4SIGN_BASE_URL", "https://sandbox.d4sign.com.br"),
    tokenApi: required("D4SIGN_TOKEN_API"),
    cryptKey: required("D4SIGN_CRYPT_KEY"),
    hmacSecret: required("D4SIGN_HMAC_SECRET"),
    uuidSafe: required("D4SIGN_UUID_SAFE"),
    templateId: required("D4SIGN_TEMPLATE_ID"),
    uuidFolder: process.env.D4SIGN_UUID_FOLDER || null,
  },

  nxfacil: {
    mode: required("NXFACIL_MODE", "mock"), // "mock" | "http"
    baseUrl: process.env.NXFACIL_BASE_URL || null,
    apiToken: process.env.NXFACIL_API_TOKEN || null,
    boletoPath: process.env.NXFACIL_BOLETO_PATH || "/v1/boletos",
    notaPath: process.env.NXFACIL_NOTA_PATH || "/v1/notas-fiscais",
  },

  databaseUrl: process.env.DATABASE_URL || null,
};
