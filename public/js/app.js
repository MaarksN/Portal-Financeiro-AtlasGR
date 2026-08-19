import { carregarSessao, sessao, sair } from './nucleo/api.js';
import { h, limpar, icone, iniciais, toast, carregando } from './nucleo/ui.js';

import * as inicio from './telas/inicio.js';
import * as reembolsos from './telas/reembolsos.js';
import * as aprovacoes from './telas/aprovacoes.js';
import * as cobrancas from './telas/cobrancas.js';
import * as fontes from './telas/fontes.js';
import * as empresas from './telas/empresas.js';
import * as contratos from './telas/contratos.js';
import * as fiscal from './telas/fiscal.js';
import * as pdv from './telas/pdv.js';
import * as cadastros from './telas/cadastros.js';
import * as relatorios from './telas/relatorios.js';
import * as financeiro from './telas/financeiro.js';
import * as produtos from './telas/produtos.js';
import * as clientes from './telas/clientes.js';
import * as ia from './telas/ia.js';

// ------------------------------------------------------------------
// Casca da central: navegação lateral montada a partir das permissões
// da sessão e um roteador por hash (#/cobrancas/12). Sem build, sem
// framework — cada tela é um módulo com `montar(raiz, contexto)`.
// ------------------------------------------------------------------

const TELAS = {
  inicio: { modulo: inicio, rotulo: 'Início', icone: 'inicio', grupo: 'Central' },
  reembolsos: { modulo: reembolsos, rotulo: 'Reembolso', icone: 'reembolso', grupo: 'Central' },
  aprovacoes: {
    modulo: aprovacoes, rotulo: 'Aprovações', icone: 'aprovacao', grupo: 'Gestão',
    quando: (p) => p.aprovaReembolso,
  },
  cobrancas: {
    modulo: cobrancas, rotulo: 'Cobranças', icone: 'cobranca', grupo: 'Gestão',
    quando: (p) => p.financeiro,
  },
  fontes: {
    modulo: fontes, rotulo: 'Fontes e integrações', icone: 'fonte', grupo: 'Gestão',
    quando: (p) => p.financeiro || p.ti || p.admin,
  },
  empresas: {
    modulo: empresas, rotulo: 'Empresas', icone: 'usuario', grupo: 'Administração',
    quando: (p) => p.admin,
  },
  contratos: {
    modulo: contratos, rotulo: 'Contratos & Cobrança', icone: 'externo', grupo: 'Gestão',
    quando: (p) => p.comercial || p.financeiro || p.admin,
  },
  cadastros: {
    modulo: cadastros, rotulo: 'Cadastros', icone: 'usuario', grupo: 'Gestão',
    quando: (p) => p.admin || p.financeiro || p.comercial,
  },
  relatorios: {
    modulo: relatorios, rotulo: 'Relatórios', icone: 'filtro', grupo: 'Gestão',
    quando: (p) => p.admin || p.financeiro,
  },
  financeiro: {
    modulo: financeiro, rotulo: 'Financeiro', icone: 'cobranca', grupo: 'Gestão',
    quando: (p) => p.admin || p.financeiro,
  },
  produtos: {
    modulo: produtos, rotulo: 'Produtos', icone: 'anexo', grupo: 'Gestão',
    quando: (p) => p.admin || p.comercial,
  },
  clientes: {
    modulo: clientes, rotulo: 'Clientes', icone: 'usuario', grupo: 'Gestão',
    quando: (p) => p.admin || p.comercial,
  },
  fiscal: {
    modulo: fiscal, rotulo: 'Fiscal', icone: 'anexo', grupo: 'Administração',
    quando: (p) => p.admin,
  },
  pdv: {
    modulo: pdv, rotulo: 'Frente de caixa', icone: 'busca', grupo: 'Administração',
    quando: (p) => p.admin,
  },
  assistente: {
    modulo: ia, rotulo: 'Assistente', icone: 'assistente', grupo: 'Central',
  },
};

const raizPagina = document.getElementById('pagina');
const buscaNavegacao = document.getElementById('busca-navegacao');
const favoritosNavegacao = document.getElementById('favoritos-navegacao');
const recentesNavegacao = document.getElementById('recentes-navegacao');
const navegacao = document.getElementById('navegacao');
const tituloPagina = document.getElementById('titulo-pagina');
const subtituloPagina = document.getElementById('subtitulo-pagina');
const acoesPagina = document.getElementById('acoes-pagina');

// Contadores que aparecem ao lado do item de menu (fila de aprovação,
// cobranças que vencem hoje). Preenchidos pelas telas.
const distintivos = {};
const CHAVE_PREFERENCIAS = 'atlasgr.portal.preferencias.v1';
const MAX_RECENTES = 6;
let filtroNavegacao = '';
let preferencias = carregarPreferencias();

function carregarPreferencias() {
  try {
    const salvas = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || '{}');
    return {
      favoritos: Array.isArray(salvas.favoritos) ? salvas.favoritos.filter((chave) => TELAS[chave]) : [],
      recentes: Array.isArray(salvas.recentes) ? salvas.recentes.filter((chave) => TELAS[chave]) : [],
    };
  } catch (_erro) {
    return { favoritos: [], recentes: [] };
  }
}

function salvarPreferencias() {
  localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(preferencias));
}

function registrarRecente(chave) {
  preferencias.recentes = [chave, ...preferencias.recentes.filter((item) => item !== chave)].slice(0, MAX_RECENTES);
  salvarPreferencias();
}

function alternarFavorito(chave) {
  const jaExiste = preferencias.favoritos.includes(chave);
  preferencias.favoritos = jaExiste
    ? preferencias.favoritos.filter((item) => item !== chave)
    : [...preferencias.favoritos, chave];
  salvarPreferencias();
  desenharNavegacao();
  toast(jaExiste ? 'Favorito removido.' : 'Página adicionada aos favoritos.');
}

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

function correspondeFiltro(chave, tela) {
  const termo = filtroNavegacao.trim().toLocaleLowerCase('pt-BR');
  if (!termo) return true;
  return [chave, tela.rotulo, tela.grupo].some((valor) => String(valor).toLocaleLowerCase('pt-BR').includes(termo));
}

function montarAtalho(chave, atual) {
  const tela = TELAS[chave];
  if (!tela) return null;
  return h('a', { class: `atalho-nav ${chave === atual ? 'on' : ''}`, href: `#/${chave}` }, tela.rotulo);
}

function desenharNavegacao() {
  const atual = rotaAtual().tela;
  const visiveis = telasVisiveis();
  const chavesVisiveis = new Set(visiveis.map(([chave]) => chave));
  limpar(navegacao);
  limpar(favoritosNavegacao);
  limpar(recentesNavegacao);

  const favoritosVisiveis = preferencias.favoritos.filter((chave) => chavesVisiveis.has(chave));
  favoritosNavegacao.append(...(favoritosVisiveis.length
    ? favoritosVisiveis.map((chave) => montarAtalho(chave, atual))
    : [h('span', { class: 'atalho-vazio' }, 'Use ☆ nos módulos para favoritar.')]));

  const recentesVisiveis = preferencias.recentes.filter((chave) => chavesVisiveis.has(chave) && !favoritosVisiveis.includes(chave));
  recentesNavegacao.append(...(recentesVisiveis.length
    ? recentesVisiveis.map((chave) => montarAtalho(chave, atual))
    : [h('span', { class: 'atalho-vazio' }, 'Suas telas acessadas aparecem aqui.')]));

  let grupoAnterior = null;
  let total = 0;
  for (const [chave, tela] of visiveis.filter(([chave, tela]) => correspondeFiltro(chave, tela))) {
    if (tela.grupo !== grupoAnterior) {
      navegacao.append(h('div', { class: 'lateral-grupo' }, tela.grupo));
      grupoAnterior = tela.grupo;
    }
    const distintivo = distintivos[chave];
    const favorito = preferencias.favoritos.includes(chave);
    navegacao.append(h('a', {
      class: `nav-item ${chave === atual ? 'on' : ''}`,
      href: `#/${chave}`,
    },
    icone(tela.icone),
    h('span', {}, tela.rotulo),
    h('button', {
      class: `favorito-nav ${favorito ? 'on' : ''}`,
      type: 'button',
      title: favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
      'aria-label': favorito ? `Remover ${tela.rotulo} dos favoritos` : `Adicionar ${tela.rotulo} aos favoritos`,
      onclick: (evento) => { evento.preventDefault(); evento.stopPropagation(); alternarFavorito(chave); },
    }, favorito ? '★' : '☆'),
    distintivo?.valor
      ? h('span', { class: `contagem ${distintivo.urgente ? 'urgente' : ''}` }, String(distintivo.valor))
      : null));
    total += 1;
  }

  if (!total) {
    navegacao.append(h('div', { class: 'nav-sem-resultado' }, 'Nenhum módulo encontrado.'));
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
      h('span', {}, 'Modo demonstração — dados semeados localmente. Configure Bitrix e as fontes de cobrança no .env para usar os sistemas reais.')),
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
  registrarRecente(tela);
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

  buscaNavegacao.addEventListener('input', (evento) => {
    filtroNavegacao = evento.target.value;
    desenharNavegacao();
  });

  desenharRodape();
  desenharFaixaDemo();
  window.addEventListener('hashchange', rotear);
  await rotear();
}

iniciar().catch((erro) => {
  toast(erro.message, 'erro');
  limpar(raizPagina).append(h('div', { class: 'carregando' }, 'Falha ao iniciar a central.'));
});
