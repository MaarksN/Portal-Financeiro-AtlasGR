'use strict';

const bcrypt = require('bcryptjs');

const config = require('../config');
const log = require('../lib/log');
const { consultarUm, executar, emTransacao } = require('./index');

// ------------------------------------------------------------------
// Semeadura idempotente: cada bloco só roda se a tabela estiver
// vazia. Os usuários e a política entram sempre (o portal precisa
// deles para funcionar); a carteira de cobranças, os chamados e os
// relatórios de reembolso só entram em modo demonstração.
// ------------------------------------------------------------------

const vazia = (tabela) => consultarUm(`SELECT count(*) AS n FROM ${tabela}`).n === 0;

const dia = (deslocamento) => {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + deslocamento);
  return data.toISOString().slice(0, 10);
};

// ------------------------------- Pessoas -------------------------------
const USUARIOS = [
  {
    email: 'comercial@atlasgr.com.br',
    nome: 'Comercial',
    papeis: ['solicitante'],
    centroCusto: 'Comercial',
    gestor: 'gerencia@atlasgr.com.br',
  },
  {
    email: 'financeiro@atlasgr.com.br',
    nome: 'Financeiro',
    papeis: ['solicitante', 'financeiro'],
    centroCusto: 'Financeiro',
    gestor: 'gerencia@atlasgr.com.br',
  },
  {
    email: 'ti@atlasgr.com.br',
    nome: 'TI',
    papeis: ['solicitante', 'ti'],
    centroCusto: 'Tecnologia',
    gestor: 'gerencia@atlasgr.com.br',
  },
  {
    email: 'rh@atlasgr.com.br',
    nome: 'RH',
    papeis: ['solicitante', 'coordenacao'],
    centroCusto: 'Administrativo',
    gestor: 'gerencia@atlasgr.com.br',
  },
  {
    email: 'coordenacao@atlasgr.com.br',
    nome: 'Coordenação de Operações',
    papeis: ['solicitante', 'coordenacao'],
    centroCusto: 'Operações',
    gestor: 'gerencia@atlasgr.com.br',
  },
  {
    email: 'gerencia@atlasgr.com.br',
    nome: 'Gerência',
    papeis: ['solicitante', 'gerencia'],
    centroCusto: 'Operações',
    gestor: 'diretoria@atlasgr.com.br',
  },
  {
    email: 'diretoria@atlasgr.com.br',
    nome: 'Diretoria',
    papeis: ['solicitante', 'diretoria'],
    centroCusto: 'Diretoria',
    gestor: null,
  },
  {
    email: 'admin@atlasgr.com.br',
    nome: 'Administrador do portal',
    papeis: ['admin'],
    centroCusto: 'Tecnologia',
    gestor: null,
  },
];

function semearUsuarios() {
  if (!vazia('usuarios')) return;
  // Senha única de primeiro acesso. Está documentada no README e
  // precisa ser trocada antes do portal sair da rede interna.
  const hash = bcrypt.hashSync('atlas123', 10);
  const inserir = executar.bind(null, `
    INSERT INTO usuarios (email, nome, senha_hash, papeis, centro_custo, gestor_email)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const u of USUARIOS) {
    inserir(u.email, u.nome, hash, JSON.stringify(u.papeis), u.centroCusto, u.gestor);
  }
  log.info('Usuários iniciais criados', { total: USUARIOS.length });
}

// ---------------------------- Política ----------------------------
// Teto em reais; `null` = sem teto. `por: 'dia'` soma as despesas da
// mesma categoria no mesmo dia antes de comparar com o teto.
const CATEGORIAS = [
  { categoria: 'Alimentação',   teto: 120,  por: 'dia',  comprovante: 1, justificativa: 0 },
  { categoria: 'Hospedagem',    teto: 450,  por: 'dia',  comprovante: 1, justificativa: 0 },
  { categoria: 'Transporte',    teto: 300,  por: 'dia',  comprovante: 1, justificativa: 0 },
  { categoria: 'Combustível',   teto: 500,  por: 'item', comprovante: 1, justificativa: 0 },
  { categoria: 'Pedágio',       teto: null, por: 'item', comprovante: 1, justificativa: 0 },
  { categoria: 'Passagem aérea', teto: 2500, por: 'item', comprovante: 1, justificativa: 1 },
  { categoria: 'Material',      teto: 800,  por: 'item', comprovante: 1, justificativa: 0 },
  { categoria: 'Treinamento',   teto: null, por: 'item', comprovante: 1, justificativa: 1 },
  { categoria: 'Outro',         teto: 200,  por: 'item', comprovante: 1, justificativa: 1 },
];

function semearPolitica() {
  if (!vazia('politica_categorias')) return;
  for (const c of CATEGORIAS) {
    executar(
      `INSERT INTO politica_categorias
         (categoria, teto_centavos, teto_por, exige_comprovante, exige_justificativa)
       VALUES (?, ?, ?, ?, ?)`,
      c.categoria,
      c.teto === null ? null : c.teto * 100,
      c.por,
      c.comprovante,
      c.justificativa,
    );
  }
  log.info('Política de despesa carregada', { categorias: CATEGORIAS.length });
}

// --------------------------- Carteira demo ---------------------------
const CLIENTES = [
  ['Transportadora Bandeirantes Ltda', '12.345.678/0001-90'],
  ['LogSul Cargas S.A.',               '23.456.789/0001-01'],
  ['Rodoviário Vale Verde',            '34.567.890/0001-12'],
  ['Expresso Guarani Transportes',     '45.678.901/0001-23'],
  ['Cargas Litoral Norte',             '56.789.012/0001-34'],
  ['Translog Distribuição',            '67.890.123/0001-45'],
  ['Seguradora Pró-Rota',              '78.901.234/0001-56'],
  ['Agroexporta Centro-Oeste',         '89.012.345/0001-67'],
  ['Metalúrgica Ferrolar',             '90.123.456/0001-78'],
  ['Distribuidora Farma Sul',          '01.234.567/0001-89'],
];

// [clienteIdx, valorReais, vencimento em dias (negativo = vencida), estágio, extras]
const FATURAS = [
  [0, 18400.00,  22, 'a_vencer'],
  [1,  9750.50,  15, 'a_vencer'],
  [2, 27300.00,  30, 'a_vencer'],
  [3,  4180.00,   8, 'a_vencer'],
  [4, 12900.00,  40, 'a_vencer'],
  [5,  6540.75,   3, 'a_vencer'],
  [6, 31200.00,  18, 'a_vencer'],
  [7,  8875.00,  27, 'a_vencer'],
  [8, 15600.00,  12, 'a_vencer'],
  [9,  3290.00,   5, 'a_vencer'],

  [0,  7420.00,  -4, 'vencida'],
  [3, 11380.00,  -9, 'vencida'],
  [5,  2980.00, -14, 'vencida'],
  [8, 19750.00, -6,  'vencida'],
  [9,  5610.00, -21, 'vencida'],

  [1, 23400.00, -34, 'contato', { acao: 'Reenviar boleto por e-mail', acaoEm: dia(1) }],
  [4,  8120.00, -28, 'contato', { acao: 'Ligar para o financeiro do cliente', acaoEm: dia(0) }],
  [7, 14250.00, -41, 'contato', { acao: 'Confirmar recebimento da NF', acaoEm: dia(2) }],

  [2, 46800.00, -52, 'negociacao', { acao: 'Enviar proposta de parcelamento em 3x', acaoEm: dia(1) }],
  [6, 17900.00, -47, 'negociacao', { acao: 'Aguardando retorno da diretoria do cliente', acaoEm: dia(3) }],

  [0, 33500.00, -63, 'promessa', { promessa: dia(6), acao: 'Cobrar no dia da promessa', acaoEm: dia(6) }],
  [9,  9840.00, -58, 'promessa', { promessa: dia(2), acao: 'Confirmar depósito', acaoEm: dia(2) }],
  [5, 21600.00, -71, 'promessa', { promessa: dia(-3), quebrada: 1, acao: 'Promessa vencida — reabrir negociação', acaoEm: dia(0) }],

  [3, 58200.00, -86, 'acordo', { acao: 'Acompanhar parcela 2 de 6', acaoEm: dia(9) }],
  [8, 12400.00, -79, 'acordo', { acao: 'Acompanhar parcela 1 de 4', acaoEm: dia(4) }],

  [7, 96500.00, -134, 'juridico', { acao: 'Protesto protocolado — acompanhar cartório', acaoEm: dia(11) }],
  [2, 41300.00, -152, 'juridico', { acao: 'Aguardando parecer do jurídico', acaoEm: dia(7) }],

  [1, 13750.00, -12, 'paga', { pago: dia(-3) }],
  [4, 26400.00, -25, 'paga', { pago: dia(-18) }],
  [6,  7980.00, -8,  'paga', { pago: dia(-2) }],
  [0, 19200.00, -33, 'paga', { pago: dia(-27) }],
  [9, 34600.00, -19, 'paga', { pago: dia(-11) }],
  [8,  5450.00, -6,  'paga', { pago: dia(-1) }],

  [5, 28900.00, -218, 'perda'],
];

const RESPONSAVEIS = ['financeiro@atlasgr.com.br', 'coordenacao@atlasgr.com.br'];

function semearCobrancas() {
  if (!vazia('cobrancas')) return;

  FATURAS.forEach((linha, indice) => {
    const [clienteIdx, valor, offset, estagio, extras = {}] = linha;
    const [nome, documento] = CLIENTES[clienteIdx];
    const vencimento = dia(offset);
    const emissao = dia(offset - 30);
    const pago = extras.pago || null;

    const resultado = executar(
      `INSERT INTO cobrancas (
         origem, id_externo, documento, cliente_nome, cliente_doc, cliente_id_externo,
         valor_centavos, valor_pago_centavos, emissao, vencimento, pagamento,
         estagio, responsavel_email, proxima_acao, proxima_acao_em, promessa_em,
         promessa_quebrada, status_origem, sincronizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      'demo',
      `DEMO-${String(indice + 1).padStart(4, '0')}`,
      `NF ${String(24500 + indice)}`,
      nome,
      documento,
      `CLI-${clienteIdx + 1}`,
      Math.round(valor * 100),
      pago ? Math.round(valor * 100) : 0,
      emissao,
      vencimento,
      pago,
      estagio,
      RESPONSAVEIS[indice % RESPONSAVEIS.length],
      extras.acao || null,
      extras.acaoEm || null,
      extras.promessa || null,
      extras.quebrada || 0,
      pago ? 'Liquidada' : 'Em aberto',
    );

    const cobrancaId = resultado.lastInsertRowid;

    // Toda fatura já trabalhada nasce com pelo menos uma interação —
    // senão a régua abriria vazia e pareceria bug.
    if (!['a_vencer', 'vencida'].includes(estagio)) {
      executar(
        `INSERT INTO interacoes (cobranca_id, tipo, resumo, para_estagio, autor_email, criado_em)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
        cobrancaId,
        estagio === 'paga' ? 'nota' : 'ligacao',
        estagio === 'paga'
          ? 'Pagamento identificado na conciliação bancária.'
          : 'Primeiro contato com o financeiro do cliente.',
        estagio,
        RESPONSAVEIS[indice % RESPONSAVEIS.length],
        `-${(indice % 12) + 1} days`,
      );
    }
  });

  log.info('Carteira de cobranças semeada', { faturas: FATURAS.length, clientes: CLIENTES.length });
}

// ---------------------------- Chamados demo ----------------------------
const CHAMADOS = [
  ['Acesso / login', 'Alta',    'Não consigo entrar no Connect Plus',              'andamento', 'Em atendimento', 'ti@atlasgr.com.br',   -2],
  ['Sistema fora do ar', 'Crítica', 'Perfil Securitário não carrega os relatórios', 'andamento', 'Em atendimento', 'ti@atlasgr.com.br',   -1],
  ['Dúvida sobre processo', 'Normal', 'Como lanço reembolso de pedágio da rota BR-116?', 'todo', 'Aberto',      null,                    -4],
  ['Equipamento', 'Normal',   'Solicitação de segundo monitor para a torre de controle', 'todo', 'Aberto',   null,                    -6],
  ['Acesso / login', 'Baixa',  'Incluir novo operador no monitoramento',           'concluido', 'Concluído',   'ti@atlasgr.com.br',  -12],
];

function semearChamados() {
  if (!vazia('chamados')) return;

  CHAMADOS.forEach((linha, indice) => {
    const [categoria, prioridade, resumo, categoriaStatus, status, responsavel, offset] = linha;
    const prazoHoras = { 'Crítica': 4, Alta: 8, Normal: 24, Baixa: 72 }[prioridade] || 24;
    const abertura = new Date();
    abertura.setUTCDate(abertura.getUTCDate() + offset);
    const slaVence = new Date(abertura.getTime() + prazoHoras * 3600000);

    executar(
      `INSERT INTO chamados (
         protocolo, chave_jira, url_jira, solicitante_email, categoria, prioridade,
         resumo, descricao, status, status_categoria, responsavel,
         sla_vence_em, sla_violado, sincronizado_em, criado_em, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`,
      `CH-${new Date().getUTCFullYear()}-${String(indice + 1).padStart(4, '0')}`,
      `ATL-${1200 + indice}`,
      null,
      indice % 2 === 0 ? 'comercial@atlasgr.com.br' : 'financeiro@atlasgr.com.br',
      categoria,
      prioridade,
      resumo,
      'Chamado de demonstração — semeado para o portal ter conteúdo sem o Jira conectado.',
      status,
      categoriaStatus,
      responsavel,
      slaVence.toISOString(),
      categoriaStatus !== 'concluido' && slaVence < new Date() ? 1 : 0,
      abertura.toISOString(),
      abertura.toISOString(),
    );
  });

  log.info('Chamados de demonstração semeados', { total: CHAMADOS.length });
}

// --------------------------- Reembolsos demo ---------------------------
const RELATORIOS = [
  {
    titulo: 'Visita técnica — Curitiba e Joinville',
    solicitante: 'comercial@atlasgr.com.br',
    centroCusto: 'Comercial',
    estado: 'em_aprovacao',
    nivel: 'gerencia',
    despesas: [
      ['Passagem aérea', 'Voo GRU-CWB ida e volta', 1840.00, -9],
      ['Hospedagem', 'Hotel Curitiba - 2 diárias', 780.00, -8],
      ['Alimentação', 'Jantar com cliente Bandeirantes', 186.40, -8],
      ['Transporte', 'Aplicativo aeroporto/hotel', 142.00, -9],
    ],
    cadeia: [
      { nivel: 'coordenacao', rotulo: 'Coordenação', estado: 'aprovado', decisor: 'coordenacao@atlasgr.com.br', comentario: 'Visita prevista no plano comercial do trimestre.' },
      { nivel: 'gerencia', rotulo: 'Gerência', estado: 'pendente' },
    ],
  },
  {
    titulo: 'Combustível e pedágio — rota BR-116',
    solicitante: 'coordenacao@atlasgr.com.br',
    centroCusto: 'Operações',
    estado: 'aprovado',
    nivel: null,
    despesas: [
      ['Combustível', 'Abastecimento posto Graal', 420.00, -16],
      ['Pedágio', 'Praças BR-116 ida e volta', 168.50, -16],
      ['Alimentação', 'Almoço em rota', 74.00, -16],
    ],
    cadeia: [
      { nivel: 'coordenacao', rotulo: 'Coordenação', estado: 'aprovado', decisor: 'coordenacao@atlasgr.com.br', comentario: 'Dentro da política.' },
    ],
  },
  {
    titulo: 'Material para a torre de controle',
    solicitante: 'ti@atlasgr.com.br',
    centroCusto: 'Tecnologia',
    estado: 'rascunho',
    nivel: null,
    despesas: [
      ['Material', 'Cabo HDMI 5m + adaptadores', 189.90, -2],
    ],
    cadeia: [],
  },
  {
    titulo: 'Treinamento de monitoramento — turma de julho',
    solicitante: 'rh@atlasgr.com.br',
    centroCusto: 'Administrativo',
    estado: 'pago',
    nivel: null,
    despesas: [
      ['Treinamento', 'Curso de gerenciamento de risco', 3200.00, -38],
      ['Alimentação', 'Coffee break da turma', 340.00, -38],
    ],
    cadeia: [
      { nivel: 'coordenacao', rotulo: 'Coordenação', estado: 'aprovado', decisor: 'coordenacao@atlasgr.com.br', comentario: 'Ok.' },
      { nivel: 'gerencia', rotulo: 'Gerência', estado: 'aprovado', decisor: 'gerencia@atlasgr.com.br', comentario: 'Aprovado, verba de capacitação.' },
    ],
  },
];

function semearRelatorios() {
  if (!vazia('relatorios')) return;

  RELATORIOS.forEach((r, indice) => {
    const total = r.despesas.reduce((soma, [, , valor]) => soma + Math.round(valor * 100), 0);
    const datas = r.despesas.map(([, , , offset]) => dia(offset)).sort();

    const resultado = executar(
      `INSERT INTO relatorios (
         protocolo, titulo, solicitante_email, centro_custo, periodo_inicio, periodo_fim,
         estado, total_centavos, total_aprovado_centavos, nivel_atual, enviado_em, decidido_em, pago_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `RB-${new Date().getUTCFullYear()}-${String(indice + 1).padStart(4, '0')}`,
      r.titulo,
      r.solicitante,
      r.centroCusto,
      datas[0],
      datas[datas.length - 1],
      r.estado,
      total,
      ['aprovado', 'pago'].includes(r.estado) ? total : 0,
      r.nivel,
      r.estado === 'rascunho' ? null : dia(-5),
      ['aprovado', 'pago'].includes(r.estado) ? dia(-3) : null,
      r.estado === 'pago' ? dia(-1) : null,
    );

    const relatorioId = resultado.lastInsertRowid;

    for (const [categoria, descricao, valor, offset] of r.despesas) {
      executar(
        `INSERT INTO despesas (relatorio_id, data, categoria, descricao, valor_centavos)
         VALUES (?, ?, ?, ?, ?)`,
        relatorioId,
        dia(offset),
        categoria,
        descricao,
        Math.round(valor * 100),
      );
    }

    r.cadeia.forEach((passo, ordem) => {
      executar(
        `INSERT INTO aprovacoes (relatorio_id, nivel, rotulo, ordem, estado, decisor_email, comentario, decidido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        relatorioId,
        passo.nivel,
        passo.rotulo,
        ordem,
        passo.estado,
        passo.decisor || null,
        passo.comentario || null,
        passo.estado === 'pendente' ? null : dia(-4 + ordem),
      );
    });
  });

  log.info('Relatórios de reembolso semeados', { total: RELATORIOS.length });
}

function semear() {
  emTransacao(() => {
    semearUsuarios();
    semearPolitica();
    if (config.demo) {
      semearCobrancas();
      semearChamados();
      semearRelatorios();
    }
  })();
}

module.exports = { semear };
