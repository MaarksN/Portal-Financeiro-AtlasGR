import { api } from '../nucleo/api.js';
import { sessao } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, confirmar, campo, selecao, lerFormulario,
  moeda, data, dataHora, hoje, vazio, carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Reembolso por relatório de despesa: o funcionário agrupa os gastos
// de uma viagem/período num relatório, anexa comprovante em cada
// despesa e envia uma vez só. A política marca o que está fora da
// regra; a falta de comprovante é o único item que trava o envio.
// ------------------------------------------------------------------

const TOM_ESTADO = {
  rascunho: 'neutro', em_aprovacao: 'info', aprovado: 'ok',
  pago: 'ok', rejeitado: 'critico', devolvido: 'alerta',
};

let opcoes = null;
const carregarOpcoes = async () => {
  if (!opcoes) opcoes = await api.get('/api/reembolsos/opcoes');
  return opcoes;
};

// ------------------------- Lista de relatórios -------------------------
async function montarLista(ctx) {
  const raiz = h('div', {});
  const areaIndicadores = h('div', { class: 'indicadores' });
  const areaTabela = h('div', { class: 'cartao-corpo sem-espaco' }, carregando());

  const recarregar = async () => {
    const [resumo, lista] = await Promise.all([
      api.get('/api/reembolsos/resumo'),
      api.get('/api/reembolsos'),
    ]);

    limpar(areaIndicadores).append(
      indicador({ rotulo: 'Em aprovação', valor: resumo.emAprovacao, nota: moeda(resumo.emAprovacaoCentavos) }),
      indicador({ rotulo: 'Aprovado a receber', valor: moeda(resumo.aReceberCentavos), tom: 'ok', nota: `${resumo.aprovados} relatório(s)` }),
      indicador({ rotulo: 'Rascunhos', valor: resumo.rascunhos, nota: 'ainda não enviados' }),
      indicador({ rotulo: 'Pagos', valor: resumo.pagos, nota: 'histórico' }),
    );
    ctx.definirDistintivo('reembolsos', resumo.rascunhos + resumo.emAprovacao);

    if (!lista.length) {
      limpar(areaTabela).append(vazio('Nenhum relatório ainda',
        'Crie um relatório, lance as despesas com comprovante e envie para aprovação.'));
      return;
    }

    const corpo = h('tbody', {});
    for (const relatorio of lista) {
      corpo.append(h('tr', { class: 'clicavel', onclick: () => ctx.irPara(`reembolsos/${relatorio.id}`) },
        h('td', {}, h('div', { class: 'forte' }, relatorio.titulo),
          h('div', { class: 'silencioso', style: 'font-size:11px' }, relatorio.protocolo)),
        h('td', {}, etiqueta(relatorio.estadoRotulo, TOM_ESTADO[relatorio.estado] || 'neutro')),
        h('td', {}, relatorio.periodoInicio
          ? `${data(relatorio.periodoInicio)} – ${data(relatorio.periodoFim)}`
          : h('span', { class: 'silencioso' }, '—')),
        h('td', {}, relatorio.centroCusto || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, relatorio.nivelAtual
          ? etiqueta(`aguarda ${relatorio.nivelAtual}`, 'info')
          : h('span', { class: 'silencioso' }, '—')),
        h('td', { class: 'num forte' }, moeda(relatorio.totalCentavos))));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Relatório'), h('th', {}, 'Situação'), h('th', {}, 'Período'),
        h('th', {}, 'Centro de custo'), h('th', {}, 'Alçada'), h('th', { class: 'num' }, 'Total'))),
      corpo)));
  };

  const novoRelatorio = () => {
    const form = h('form', {},
      campo('Título do relatório', h('input', {
        type: 'text', name: 'titulo', maxlength: '150', required: true,
        placeholder: 'Ex.: Visita técnica — Curitiba e Joinville',
      }), 'Agrupe num relatório só os gastos de uma mesma viagem ou período.'),
      campo('Centro de custo', h('input', {
        type: 'text', name: 'centroCusto', maxlength: '100',
        value: sessao().usuario.centroCusto || '',
      })));

    modal({
      titulo: 'Novo relatório de despesa',
      corpo: form,
      acoes: [
        { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
        {
          rotulo: 'Criar',
          estilo: '',
          aoClicar: async (fechar) => {
            try {
              const relatorio = await api.post('/api/reembolsos', lerFormulario(form));
              fechar();
              ctx.irPara(`reembolsos/${relatorio.id}`);
            } catch (erro) {
              toast(erro.message, 'erro');
            }
          },
        },
      ],
    });
  };

  ctx.definirCabecalho({
    titulo: 'Reembolso',
    subtitulo: 'Relatórios de despesa e acompanhamento da alçada',
    acoes: [h('button', { class: 'botao', type: 'button', onclick: novoRelatorio }, icone('mais'), 'Novo relatório')],
  });

  raiz.append(areaIndicadores, h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Meus relatórios')), areaTabela));

  await recarregar();
  return raiz;
}

// --------------------------- Detalhe/editor ---------------------------
function alertaDaDespesa(alerta) {
  return h('div', {
    style: `font-size:11.5px;font-weight:600;margin-top:3px;color:${alerta.severidade === 'alto' ? 'var(--critico)' : 'var(--alerta)'}`,
  }, `⚠ ${alerta.mensagem}`);
}

async function montarDetalhe(ctx, id) {
  const raiz = h('div', {});
  const { categorias, alcadas, tamanhoMaximoMb } = await carregarOpcoes();

  const desenhar = async () => {
    const relatorio = await api.get(`/api/reembolsos/${id}`);
    const meu = relatorio.solicitante === sessao().usuario.email;
    limpar(raiz);

    // ---------------- cabeçalho ----------------
    const acoes = [
      h('button', { class: 'botao fantasma', type: 'button', onclick: () => ctx.irPara('reembolsos') }, icone('volta'), 'Voltar'),
    ];

    if (relatorio.editavel && meu) {
      acoes.push(h('button', {
        class: 'botao secundario', type: 'button',
        onclick: async () => {
          if (!await confirmar({
            titulo: 'Excluir relatório',
            texto: 'O relatório e todos os comprovantes anexados serão apagados. Não dá para desfazer.',
            confirmar: 'Excluir',
          })) return;
          await api.remover(`/api/reembolsos/${id}`);
          toast('Relatório excluído.', 'ok');
          ctx.irPara('reembolsos');
        },
      }, icone('lixeira'), 'Excluir'));

      acoes.push(h('button', {
        class: 'botao', type: 'button',
        onclick: async () => {
          try {
            await api.post(`/api/reembolsos/${id}/enviar`);
            toast('Relatório enviado para aprovação.', 'ok');
            desenhar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }, icone('enviar'), 'Enviar para aprovação'));
    }

    if (relatorio.podeDecidir) {
      const decidir = (decisao, rotulo, estilo) => h('button', {
        class: `botao ${estilo}`, type: 'button',
        onclick: () => {
          const form = h('form', {}, campo(
            decisao === 'aprovar' ? 'Comentário (opcional)' : 'Motivo',
            h('textarea', { name: 'comentario', rows: '3', required: decisao !== 'aprovar' }),
            decisao === 'devolver' ? 'O solicitante poderá corrigir e reenviar.' : null,
          ));
          modal({
            titulo: `${rotulo} — ${relatorio.protocolo}`,
            corpo: h('div', {},
              h('div', { class: 'aviso info' }, icone('relogio', 16),
                h('div', {}, `${relatorio.titulo} · ${moeda(relatorio.totalCentavos)} · ${relatorio.despesas.length} despesa(s)`)),
              form),
            acoes: [
              { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
              {
                rotulo,
                estilo,
                aoClicar: async (fechar) => {
                  try {
                    await api.post(`/api/reembolsos/${id}/decisao`, { decisao, ...lerFormulario(form) });
                    fechar();
                    toast(`${rotulo} registrado.`, 'ok');
                    desenhar();
                  } catch (erro) {
                    toast(erro.message, 'erro');
                  }
                },
              },
            ],
          });
        },
      }, rotulo);

      acoes.push(decidir('devolver', 'Devolver', 'secundario'));
      acoes.push(decidir('rejeitar', 'Rejeitar', 'perigo'));
      acoes.push(decidir('aprovar', 'Aprovar', 'sucesso'));
    }

    if (relatorio.estado === 'aprovado' && sessao().permissoes?.financeiro) {
      acoes.push(h('button', {
        class: 'botao sucesso', type: 'button',
        onclick: async () => {
          if (!await confirmar({
            titulo: 'Dar baixa no pagamento',
            texto: `Confirmar que ${moeda(relatorio.totalAprovadoCentavos)} foi pago a ${relatorio.solicitante}?`,
            confirmar: 'Marcar como pago', estilo: 'sucesso',
          })) return;
          await api.post(`/api/reembolsos/${id}/pagar`, {});
          toast('Reembolso marcado como pago.', 'ok');
          desenhar();
        },
      }, 'Marcar como pago'));
    }

    ctx.definirCabecalho({
      titulo: relatorio.titulo,
      subtitulo: `${relatorio.protocolo} · ${relatorio.solicitante}${relatorio.centroCusto ? ` · ${relatorio.centroCusto}` : ''}`,
      acoes,
    });

    // ---------------- indicadores ----------------
    raiz.append(h('div', { class: 'indicadores' },
      indicador({ rotulo: 'Total do relatório', valor: moeda(relatorio.totalCentavos), nota: `${relatorio.despesas.length} despesa(s)` }),
      indicador({
        rotulo: 'Situação', tom: relatorio.estado === 'rejeitado' ? 'critico' : (relatorio.estado === 'aprovado' || relatorio.estado === 'pago' ? 'ok' : ''),
        valor: h('span', { style: 'font-size:17px' }, relatorio.estadoRotulo),
        nota: relatorio.nivelAtual ? `aguardando ${relatorio.nivelAtual}` : (relatorio.enviadoEm ? `enviado ${data(relatorio.enviadoEm)}` : 'não enviado'),
      }),
      indicador({
        rotulo: 'Alçada necessária',
        valor: h('span', { style: 'font-size:17px' }, relatorio.alcadaFinal?.rotulo || '—'),
        nota: alcadas.map((a) => `${a.rotulo}: ${a.ateReais === null ? 'acima' : `até R$ ${a.ateReais.toLocaleString('pt-BR')}`}`).join(' · '),
      }),
      indicador({
        rotulo: 'Pendências de política', valor: relatorio.alertas.length,
        tom: relatorio.bloqueios.length ? 'critico' : (relatorio.alertas.length ? 'alerta' : 'ok'),
        nota: relatorio.bloqueios.length ? `${relatorio.bloqueios.length} trava(m) o envio` : 'nenhuma trava o envio',
      })));

    if (relatorio.bloqueios.length) {
      raiz.append(h('div', { class: 'aviso critico' }, icone('alerta', 16),
        h('div', {}, h('b', {}, 'Faltam comprovantes. '),
          'Anexe a nota ou o recibo nas despesas marcadas para poder enviar o relatório.')));
    }

    const ultimaDecisao = [...relatorio.cadeia].reverse().find((passo) => passo.comentario);
    if (['rejeitado', 'devolvido'].includes(relatorio.estado) && ultimaDecisao) {
      raiz.append(h('div', { class: `aviso ${relatorio.estado === 'rejeitado' ? 'critico' : 'alerta'}` }, icone('alerta', 16),
        h('div', {}, h('b', {}, `${relatorio.estadoRotulo} por ${ultimaDecisao.decisor}: `), ultimaDecisao.comentario)));
    }

    // ---------------- despesas ----------------
    const corpoDespesas = h('tbody', {});
    for (const despesa of relatorio.despesas) {
      const anexosDaLinha = h('div', { class: 'pilha', style: 'gap:3px' });
      for (const anexo of despesa.anexos) {
        anexosDaLinha.append(h('div', { class: 'entre', style: 'gap:5px' },
          h('a', { href: anexo.url, target: '_blank', rel: 'noopener', class: 'entre', style: 'font-size:11.5px;gap:4px' },
            icone('anexo', 12), anexo.nome.length > 22 ? `${anexo.nome.slice(0, 20)}…` : anexo.nome),
          relatorio.editavel && meu
            ? h('button', {
              class: 'botao fantasma pequeno', type: 'button', title: 'Remover comprovante',
              onclick: async () => { await api.remover(`/api/reembolsos/anexos/${anexo.id}`); desenhar(); },
            }, '×')
            : null));
      }

      if (relatorio.editavel && meu) {
        const entrada = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.webp', style: 'display:none' });
        entrada.addEventListener('change', async () => {
          if (!entrada.files?.[0]) return;
          const formData = new FormData();
          formData.append('arquivo', entrada.files[0]);
          try {
            await api.enviarArquivo(`/api/reembolsos/despesas/${despesa.id}/anexos`, formData);
            toast('Comprovante anexado.', 'ok');
            desenhar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        });
        anexosDaLinha.append(entrada, h('button', {
          class: 'botao secundario pequeno', type: 'button', onclick: () => entrada.click(),
        }, icone('anexo'), despesa.anexos.length ? 'Mais um' : 'Anexar'));
      } else if (!despesa.anexos.length) {
        anexosDaLinha.append(h('span', { class: 'silencioso', style: 'font-size:11.5px' }, 'sem comprovante'));
      }

      corpoDespesas.append(h('tr', {},
        h('td', {}, data(despesa.data)),
        h('td', {}, h('div', { class: 'forte' }, despesa.categoria),
          despesa.descricao ? h('div', { class: 'silencioso', style: 'font-size:11.5px' }, despesa.descricao) : null,
          despesa.justificativa ? h('div', { style: 'font-size:11.5px;color:var(--texto2);margin-top:3px' }, `Justificativa: ${despesa.justificativa}`) : null,
          ...despesa.alertas.map(alertaDaDespesa)),
        h('td', {}, anexosDaLinha),
        h('td', { class: 'num forte' }, moeda(despesa.valorCentavos)),
        h('td', {}, relatorio.editavel && meu
          ? h('div', { style: 'display:flex;gap:4px;justify-content:flex-end' },
            h('button', { class: 'botao fantasma pequeno', type: 'button', onclick: () => formDespesa(despesa) }, 'Editar'),
            h('button', {
              class: 'botao fantasma pequeno', type: 'button',
              onclick: async () => {
                if (!await confirmar({ titulo: 'Remover despesa', texto: 'A despesa e seus comprovantes saem do relatório.', confirmar: 'Remover' })) return;
                await api.remover(`/api/reembolsos/despesas/${despesa.id}`);
                desenhar();
              },
            }, '×'))
          : null)));
    }

    function formDespesa(existente = null) {
      const form = h('form', {},
        h('div', { class: 'linha-campos' },
          campo('Data', h('input', { type: 'date', name: 'data', max: hoje(), value: existente?.data || hoje(), required: true })),
          campo('Categoria', selecao('categoria', categorias.map((c) => ({ valor: c.categoria, rotulo: c.categoria })), existente?.categoria)),
          campo('Valor (R$)', h('input', {
            type: 'text', name: 'valor', inputmode: 'decimal', required: true,
            placeholder: '0,00', value: existente ? (existente.valorCentavos / 100).toFixed(2).replace('.', ',') : '',
          }))),
        campo('Descrição', h('input', { type: 'text', name: 'descricao', maxlength: '300', value: existente?.descricao || '', placeholder: 'O que foi gasto' })),
        h('div', { class: 'linha-campos' },
          campo('Fornecedor', h('input', { type: 'text', name: 'fornecedor', maxlength: '150', value: existente?.fornecedor || '' })),
          campo('Projeto / cliente', h('input', { type: 'text', name: 'projeto', maxlength: '150', value: existente?.projeto || '' }))),
        campo('Justificativa', h('textarea', { name: 'justificativa', rows: '2', value: existente?.justificativa || '' }),
          'Obrigatória quando a despesa passa do teto da categoria.'));

      // O textarea não aceita `value` como atributo — preencher direto.
      if (existente?.justificativa) form.querySelector('[name=justificativa]').value = existente.justificativa;

      modal({
        titulo: existente ? 'Editar despesa' : 'Nova despesa',
        corpo: h('div', {},
          h('div', { class: 'aviso info' }, icone('relogio', 16),
            h('div', {}, `Comprovante de até ${tamanhoMaximoMb} MB em PDF, JPG, PNG ou WEBP. Anexe depois de salvar a despesa.`)),
          form),
        acoes: [
          { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
          {
            rotulo: existente ? 'Salvar' : 'Adicionar',
            estilo: '',
            aoClicar: async (fechar) => {
              try {
                const dados = lerFormulario(form);
                if (existente) await api.patch(`/api/reembolsos/despesas/${existente.id}`, dados);
                else await api.post(`/api/reembolsos/${id}/despesas`, dados);
                fechar();
                desenhar();
              } catch (erro) {
                toast(erro.message, 'erro');
              }
            },
          },
        ],
      });
    }

    const cartaoDespesas = h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' },
        h('h3', {}, 'Despesas'),
        h('div', { class: 'acoes' },
          relatorio.editavel && meu
            ? h('button', { class: 'botao pequeno', type: 'button', onclick: () => formDespesa() }, icone('mais'), 'Adicionar despesa')
            : null)),
      h('div', { class: 'cartao-corpo sem-espaco' },
        relatorio.despesas.length
          ? h('div', { class: 'tabela-envolve' }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Data'), h('th', {}, 'Categoria e descrição'), h('th', {}, 'Comprovante'),
              h('th', { class: 'num' }, 'Valor'), h('th', {}, ''))),
            corpoDespesas,
            h('tfoot', {}, h('tr', {},
              h('td', { colspan: '3', class: 'forte', style: 'text-align:right' }, 'Total'),
              h('td', { class: 'num forte', style: 'font-size:15px' }, moeda(relatorio.totalCentavos)),
              h('td', {})))))
          : vazio('Nenhuma despesa lançada', 'Adicione as despesas deste relatório e anexe os comprovantes.')));

    // ---------------- cadeia de alçada ----------------
    const passos = relatorio.cadeia.length ? relatorio.cadeia : (relatorio.cadeiaPrevista || []).map((p) => ({ ...p, estado: 'previsto' }));
    const linhaDoTempo = h('ul', { class: 'timeline' });
    for (const passo of passos) {
      const classe = { aprovado: 'feito', rejeitado: 'recusado', devolvido: 'recusado', pendente: 'atual' }[passo.estado] || '';
      linhaDoTempo.append(h('li', { class: classe },
        h('div', { class: 'titulo' }, passo.rotulo),
        h('div', { class: 'quando' }, {
          aprovado: `Aprovado por ${passo.decisor} · ${dataHora(passo.decididoEm)}`,
          rejeitado: `Rejeitado por ${passo.decisor} · ${dataHora(passo.decididoEm)}`,
          devolvido: `Devolvido por ${passo.decisor} · ${dataHora(passo.decididoEm)}`,
          pendente: 'Aguardando decisão',
          pulado: 'Não chegou a decidir',
          previsto: 'Será necessário ao enviar',
        }[passo.estado] || passo.estado),
        passo.comentario ? h('div', { class: 'texto' }, `"${passo.comentario}"`) : null));
    }

    const historico = h('ul', { class: 'timeline' });
    for (const evento of relatorio.historico.slice(0, 12)) {
      historico.append(h('li', { class: 'feito' },
        h('div', { class: 'titulo' }, evento.acao.replace('relatorio.', '').replace('comprovante.', 'comprovante ')),
        h('div', { class: 'quando' }, `${evento.ator_email} · ${dataHora(evento.criado_em)}`)));
    }

    raiz.append(h('div', { class: 'grade lateral-direita' },
      cartaoDespesas,
      h('div', { class: 'pilha', style: 'gap:16px' },
        h('div', { class: 'cartao' },
          h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Cadeia de aprovação')),
          h('div', { class: 'cartao-corpo' }, passos.length ? linhaDoTempo : h('div', { class: 'silencioso', style: 'font-size:12.5px' }, 'Adicione despesas para calcular a alçada.'))),
        h('div', { class: 'cartao' },
          h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Histórico')),
          h('div', { class: 'cartao-corpo' }, relatorio.historico.length ? historico : h('div', { class: 'silencioso', style: 'font-size:12.5px' }, 'Sem movimentação.'))))));
  };

  await desenhar();
  return raiz;
}

export async function montar(ctx) {
  return ctx.parametro ? montarDetalhe(ctx, Number(ctx.parametro)) : montarLista(ctx);
}
