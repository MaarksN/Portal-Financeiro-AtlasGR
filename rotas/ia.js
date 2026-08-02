'use strict';

const express = require('express');
const { z } = require('zod');
const { rateLimit } = require('express-rate-limit');
const { rota } = require('../lib/erros');
const { validarCorpo } = require('./comum');
const { consultar, executar } = require('../db');
const { exigirPapel } = require('../lib/seguranca');

const router = express.Router();

const permiteAcessoIA = exigirPapel('financeiro', 'admin', 'diretoria');
router.use(permiteAcessoIA);

// Rate limiting específico para a IA para prevenir abusos
const limiteIA = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // limite de 10 perguntas por minuto por IP
  message: { erro: 'Muitas requisições. Tente novamente em um minuto.', codigo: 'rate_limit_ia' },
  standardHeaders: true,
  legacyHeaders: false,
});

const esquemaPergunta = z.object({
  pergunta: z.string().trim().min(5, 'A pergunta deve ter pelo menos 5 caracteres.').max(1000, 'A pergunta excede o tamanho máximo (1000).')
});

// Interface de Adaptação de IA (Preparação para integração real)
class SimulatedProvider {
  constructor() {
    this.nome = 'Atlas Simulação Local v1';
  }

  async gerarResposta(prompt) {
    const p = prompt.toLowerCase();
    let resposta = '';

    // Simulação com base em palavras-chave e dados reais
    if (p.includes('receita') || p.includes('recebimento') || p.includes('faturamento')) {
        const result = consultar(`SELECT sum(valor_pago_centavos) as total FROM cobrancas WHERE valor_pago_centavos > 0`);
        const valor = (result[0].total / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        resposta = `Com base nos registros atuais de cobranças pagas, a receita total registrada no sistema é de ${valor}.`;
    }
    else if (p.includes('despesa') || p.includes('reembolso') || p.includes('gasto')) {
        const result = consultar(`SELECT sum(total_aprovado_centavos) as total FROM relatorios WHERE estado IN ('pago', 'aprovado')`);
        const valor = (result[0].total / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        resposta = `Analisando os relatórios de reembolso pagos ou aprovados, as despesas totais somam ${valor}.`;
    }
    else if (p.includes('chamado') || p.includes('ti')) {
        const result = consultar(`SELECT count(id) as total FROM chamados WHERE status_categoria = 'andamento'`);
        resposta = `Temos atualmente ${result[0].total} chamados em andamento no sistema.`;
    }
    else if (p.includes('estoque') || p.includes('produto') || p.includes('compra') || p.includes('venda')) {
        resposta = 'Ainda não tenho acesso aos dados completos de estoque, vendas e compras, pois esses módulos estão em construção na atual onda de desenvolvimento. Assim que estiverem operacionais, poderei analisá-los para você.';
    }
    else {
        resposta = 'Entendi a sua pergunta, mas como sou um assistente em desenvolvimento, meu conhecimento atual foca nos módulos financeiros (receitas via cobranças e despesas via reembolsos) e de chamados de TI. Pode me perguntar sobre esses temas!';
    }

    await new Promise(resolve => setTimeout(resolve, 800)); // Delay para simular latência de rede

    return {
      texto: resposta,
      metadados: {
        provider: this.nome,
        simulado: true,
        tokensEstimados: Math.ceil(prompt.length / 4)
      }
    };
  }
}

const aiProvider = new SimulatedProvider();

router.post('/perguntar', limiteIA, validarCorpo(esquemaPergunta), rota(async (req, res) => {
  const { pergunta } = req.dados;
  const usuario = req.session.usuario;

  let resultado;
  let statusRegistro = 'pendente';
  let erroGeracao = null;

  try {
    resultado = await aiProvider.gerarResposta(pergunta);
    statusRegistro = 'sucesso';
  } catch (err) {
    statusRegistro = 'erro';
    erroGeracao = err.message;
    resultado = {
      texto: 'Desculpe, ocorreu um erro de processamento na minha IA no momento.',
      metadados: { erro: erroGeracao, provider: aiProvider.nome }
    };
  }

  // Persistência segura do histórico da IA
  try {
    const metadadosJson = JSON.stringify(resultado.metadados);
    executar(
      `INSERT INTO ia_historico (autor_email, pergunta, resposta, status, metadados) VALUES (?, ?, ?, ?, ?)`,
      usuario.email,
      pergunta,
      resultado.texto,
      statusRegistro,
      metadadosJson
    );
  } catch (err) {
    console.error('Falha ao auditar histórico de IA:', err);
  }

  if (erroGeracao) {
    return res.status(500).json({ texto: resultado.texto, erro: true });
  }

  res.json({ texto: resultado.texto, metadados: resultado.metadados });
}));

module.exports = router;
