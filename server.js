require('./lib/observability');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const financasRouter = require('./rotas/financas');
const { httpLogger, logger } = require('./lib/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de Segurança e CORS
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(httpLogger);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Registrar rotas de API
app.use('/api/financas', financasRouter);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'portal-financeiro-atlasgr' });
});

// Rota fallback para index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info({ port: Number(PORT) }, 'Portal Financeiro AtlasGR iniciado');
        logger.info({ url: `http://localhost:${PORT}/api/financas/resumo` }, 'API de Finanças disponível');
    });
}

module.exports = app;
