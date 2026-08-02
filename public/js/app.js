import { carregarSessao, sessao, sair } from './nucleo/api.js';
import { h, limpar, icone, iniciais, toast, carregando } from './nucleo/ui.js';

import * as inicio from './telas/inicio.js';
import * as chamados from './telas/chamados.js';
import * as reembolsos from './telas/reembolsos.js';
import * as aprovacoes from './telas/aprovacoes.js';
import * as cobrancas from './telas/cobrancas.js';
import * as fontes from './telas/fontes.js';
import * as empresas from './telas/empresas.js';
import * as cadastros from './telas/cadastros.js';


// ------------------------------------------------------------------
// Casca da central: navegação lateral montada a partir das permissões
// da sessão e um roteador por hash (#/cobrancas/12). Sem build, sem
// framework — cada tela é um módulo com `montar(raiz, contexto)`.
// ------------------------------------------------------------------

const TELAS = {
  inicio: { modulo: inicio, rotulo: 'Início', icone: 'inicio', grupo: 'Central' },
  chamados: { modulo: chamados, rotulo: 'Chamados', icone: 'chamado', grupo: 'Central' },
  reembolsos: { modulo: reembolsos, rotulo: 'Reembolso', icone: 'reembolso', grupo: 'Central' },
  aprovacoes: {
    modulo: aprovacoes, rotulo: 'Aprovações', icone: 'aprovacao', grupo: 'Gestão',
    quando: (p) => p.aprovaReembolso,
  },
  cobrancas: {
    modulo: cobrancas, rotulo: 'Cobranças', icone: 'cobranca', grupo: 'Gestão',
    quando: (p) => p.financeiro,
  },
  empresas: {
    modulo: empresas, rotulo: 'Empresas e Filiais', icone: 'fonte', grupo: 'Gestão',
    quando: (p) => p.admin
  },
  cadastros: {
    modulo: cadastros, rotulo: 'Cadastros', icone: 'fonte', grupo: 'Gestão',
    quando: (p) => p.admin || p.financeiro
  },
  fontes: {
    modulo: fontes, rotulo: 'Fontes e integrações', icone: 'fonte', grupo: 'Gestão',
    quando: (p) => p.financeiro || p.ti || p.admin,
  },
};

const raizPagina = document.getElementById('pagina');
const navegacao = document.getElementById('navegacao');
const tituloPagina = document.getElementById('titulo-pagina');
const subtituloPagina = document.getElementById('subtitulo-pagina');
const acoesPagina = document.getElementById('acoes-pagina');

// Contadores que aparecem ao lado do item de menu (fila de aprovação,
// cobranças que vencem hoje). Preenchidos pelas telas.
const distintivos = {};

function definirCabecalho({ titulo, subtitulo = '', acoes = [] }) {
  tituloPagina.textContent = titulo;
  subtituloPagina.textContent = subtitulo;
  limpar(acoesPagina).append(...acoes.filter(Boolean));
}

function irPara(rota) {
  window.location.hash = `#/${rota}`;
}

const contexto = {
  definirCabecalho,
  irPara,
  definirDistintivo(chave, valor, urgente = false) {
    distintivos[chave] = { valor, urgente };
    desenharNavegacao();
  },
  recarregar: () => rotear(),
};

function telasVisiveis() {
  const permissoes = sessao()?.permissoes || {};
  return Object.entries(TELAS).filter(([, tela]) => !tela.quando || tela.quando(permissoes));
}

function desenharNavegacao() {
  const atual = rotaAtual().tela;
  const visiveis = telasVisiveis();
  limpar(navegacao);

  let grupoAnterior = null;
  for (const [chave, tela] of visiveis) {
    if (tela.grupo !== grupoAnterior) {
      navegacao.append(h('div', { class: 'lateral-grupo' }, tela.grupo));
      grupoAnterior = tela.grupo;
    }
    const distintivo = distintivos[chave];
    navegacao.append(h('a', {
      class: `nav-item ${chave === atual ? 'on' : ''}`,
      href: `#/${chave}`,
    },
    icone(tela.icone),
    h('span', {}, tela.rotulo),
    distintivo?.valor
      ? h('span', { class: `contagem ${distintivo.urgente ? 'urgente' : ''}` }, String(distintivo.valor))
      : null));
  }
}

function desenharRodape() {
  const usuario = sessao().usuario;
  const rodape = document.getElementById('rodape-lateral');
  limpar(rodape).append(
    h('div', { class: 'usuario-bloco' },
      h('div', { class: 'avatar' }, iniciais(usuario.nome)),
      h('div', {},
        h('b', {}, usuario.nome),
        h('span', { title: usuario.email }, usuario.email))),
    h('button', { class: 'sair', type: 'button', onclick: sair }, 'Sair'),
  );
}

function desenharFaixaDemo() {
  if (!sessao().modoDemo) return;
  document.getElementById('faixa-demo').append(
    h('div', { class: 'faixa-demo' },
      icone('alerta', 14),
      h('span', {}, 'Modo demonstração — dados semeados localmente. Configure Jira, Bitrix e as fontes de cobrança no .env para usar os sistemas reais.')),
  );
}

// Rota no formato #/tela/parametro
function rotaAtual() {
  const bruto = (window.location.hash || '#/inicio').replace(/^#\/?/, '');
  const [tela, parametro] = bruto.split('/');
  return { tela: TELAS[tela] ? tela : 'inicio', parametro: parametro || null };
}

let sequencia = 0;

async function rotear() {
  const { tela, parametro } = rotaAtual();
  const visiveis = telasVisiveis().map(([chave]) => chave);

  if (!visiveis.includes(tela)) {
    irPara(visiveis[0] || 'inicio');
    return;
  }

  const meuTurno = ++sequencia;
  desenharNavegacao();
  limpar(raizPagina).append(carregando());
  definirCabecalho({ titulo: TELAS[tela].rotulo });

  try {
    const conteudo = await TELAS[tela].modulo.montar({ ...contexto, parametro });
    // Se o usuário trocou de tela enquanto esta carregava, descarta.
    if (meuTurno !== sequencia) return;
    limpar(raizPagina).append(conteudo);
  } catch (erro) {
    if (meuTurno !== sequencia) return;
    limpar(raizPagina).append(
      h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
        h('div', { class: 'aviso critico' }, icone('alerta', 16),
          h('div', {}, h('b', {}, 'Não foi possível carregar esta tela. '), erro.message)),
        h('button', { class: 'botao secundario', type: 'button', onclick: () => rotear() }, 'Tentar de novo'))),
    );
  }
}

async function iniciar() {
  const dados = await carregarSessao();
  if (!dados.autenticado) {
    window.location.href = '/login.html';
    return;
  }

  desenharRodape();
  desenharFaixaDemo();
  window.addEventListener('hashchange', rotear);
  await rotear();
}

iniciar().catch((erro) => {
  toast(erro.message, 'erro');
  limpar(raizPagina).append(h('div', { class: 'carregando' }, 'Falha ao iniciar a central.'));
});
