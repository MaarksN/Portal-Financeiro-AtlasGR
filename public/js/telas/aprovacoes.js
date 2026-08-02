import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, campo, lerFormulario,
  moeda, data, desdeQuando, vazio, carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

// Fila de aprovação. Só aparece o que está esperando a alçada DESTE
// usuário — quem aprova não precisa garimpar numa lista geral.

export async function montar(ctx) {
  const raiz = h('div', {});
  const areaIndicadores = h('div', { class: 'indicadores' });
  const areaTabela = h('div', { class: 'cartao-corpo sem-espaco' }, carregando());

  const decidir = (relatorio, decisao, rotulo, estilo, aoTerminar) => {
    const form = h('form', {}, campo(
      decisao === 'aprovar' ? 'Comentário (opcional)' : 'Motivo',
      h('textarea', { name: 'comentario', rows: '3', required: decisao !== 'aprovar' }),
      decisao === 'devolver' ? 'O solicitante poderá corrigir e reenviar o mesmo relatório.' : null,
    ));

    modal({
      titulo: `${rotulo} — ${relatorio.protocolo}`,
      corpo: h('div', {},
        h('div', { class: 'aviso info' }, icone('relogio', 16),
          h('div', {},
            h('b', {}, relatorio.titulo), h('br'),
            `${relatorio.solicitante} · ${moeda(relatorio.totalCentavos)} · ${relatorio.itens} despesa(s)`,
            relatorio.alertas ? h('div', { style: 'margin-top:4px' }, `${relatorio.alertas} alerta(s) de política — vale abrir o relatório antes de decidir.`) : null)),
        form),
      acoes: [
        { rotulo: 'Ver relatório completo', aoClicar: (fechar) => { fechar(); ctx.irPara(`reembolsos/${relatorio.id}`); } },
        {
          rotulo,
          estilo,
          aoClicar: async (fechar) => {
            try {
              await api.post(`/api/reembolsos/${relatorio.id}/decisao`, { decisao, ...lerFormulario(form) });
              fechar();
              toast(`${rotulo} registrado.`, 'ok');
              aoTerminar();
            } catch (erro) {
              toast(erro.message, 'erro');
            }
          },
        },
      ],
    });
  };

  const recarregar = async () => {
    const fila = await api.get('/api/reembolsos/fila');

    const total = fila.reduce((soma, r) => soma + r.totalCentavos, 0);
    const comAlerta = fila.filter((r) => r.alertas > 0).length;
    const antigo = fila.reduce((maior, r) => {
      const dias = (Date.now() - new Date(String(r.aguardandoDesde).replace(' ', 'T') + 'Z')) / 86400000;
      return Number.isFinite(dias) ? Math.max(maior, Math.floor(dias)) : maior;
    }, 0);

    limpar(areaIndicadores).append(
      indicador({ rotulo: 'Aguardando você', valor: fila.length, tom: fila.length ? 'alerta' : 'ok', nota: 'na sua alçada' }),
      indicador({ rotulo: 'Valor em espera', valor: moeda(total), nota: 'soma dos relatórios da fila' }),
      indicador({ rotulo: 'Com alerta de política', valor: comAlerta, tom: comAlerta ? 'alerta' : '', nota: 'revise antes de aprovar' }),
      indicador({ rotulo: 'Espera mais longa', valor: `${antigo}d`, tom: antigo > 3 ? 'critico' : '', nota: 'desde o envio' }),
    );
    ctx.definirDistintivo('aprovacoes', fila.length, fila.length > 0);

    if (!fila.length) {
      limpar(areaTabela).append(vazio('Nada esperando por você', 'Quando um relatório chegar à sua alçada, ele aparece aqui.'));
      return;
    }

    const corpo = h('tbody', {});
    for (const relatorio of fila) {
      corpo.append(h('tr', {},
        h('td', { class: 'clicavel', onclick: () => ctx.irPara(`reembolsos/${relatorio.id}`) },
          h('div', { class: 'forte' }, relatorio.titulo),
          h('div', { class: 'silencioso', style: 'font-size:11px' }, `${relatorio.protocolo} · ${relatorio.solicitante}`)),
        h('td', {}, relatorio.centroCusto || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, relatorio.periodoInicio ? `${data(relatorio.periodoInicio)} – ${data(relatorio.periodoFim)}` : '—'),
        h('td', { class: 'num' }, relatorio.itens),
        h('td', {}, relatorio.alertas
          ? etiqueta(`${relatorio.alertas} alerta(s)`, 'alerta')
          : etiqueta('sem alertas', 'ok')),
        h('td', { class: 'silencioso', style: 'font-size:12px' }, desdeQuando(relatorio.aguardandoDesde)),
        h('td', { class: 'num forte' }, moeda(relatorio.totalCentavos)),
        h('td', {}, h('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
          h('button', { class: 'botao secundario pequeno', type: 'button', onclick: () => decidir(relatorio, 'devolver', 'Devolver', 'secundario', recarregar) }, 'Devolver'),
          h('button', { class: 'botao perigo pequeno', type: 'button', onclick: () => decidir(relatorio, 'rejeitar', 'Rejeitar', 'perigo', recarregar) }, 'Rejeitar'),
          h('button', { class: 'botao sucesso pequeno', type: 'button', onclick: () => decidir(relatorio, 'aprovar', 'Aprovar', 'sucesso', recarregar) }, 'Aprovar')))));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Relatório'), h('th', {}, 'Centro de custo'), h('th', {}, 'Período'),
        h('th', { class: 'num' }, 'Itens'), h('th', {}, 'Política'), h('th', {}, 'Na fila'),
        h('th', { class: 'num' }, 'Total'), h('th', {}, ''))),
      corpo)));
  };

  ctx.definirCabecalho({
    titulo: 'Aprovações',
    subtitulo: 'Relatórios de reembolso aguardando a sua alçada',
    acoes: [h('button', { class: 'botao secundario', type: 'button', onclick: recarregar }, icone('atualizar'), 'Atualizar')],
  });

  raiz.append(areaIndicadores, h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Sua fila')), areaTabela));

  await recarregar();
  return raiz;
}
