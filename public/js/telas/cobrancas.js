import { api, comQuery, sessao } from '../nucleo/api.js';
import { botaoAnaliseIA } from '../nucleo/analiseIA.js';
import {
  h, limpar, icone, toast, modal, campo, selecao, lerFormulario,
  moeda, moedaCurta, data, dataHora, desdeQuando, hoje, emDias, mesAno,
  vazio, carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Cobranças — o funil do financeiro.
//
// Cada fatura é um cartão que anda por estágios controlados AQUI, não
// nos sistemas de origem. Arrastar registra a mudança na régua; os
// estágios que exigem compromisso (promessa, jurídico) pedem data ou
// justificativa antes de aceitar o movimento.
// ------------------------------------------------------------------

const filtros = {
  busca: '', faixa: '', responsavel: '', origem: '',
  apenasAtrasadas: false, apenasAbertas: false,
};
let visao = 'funil';
let painel = null;
let usuariosCache = null;

const TOM_ESTAGIO = new Map();

// ---------------------- Importar boleto/informativo ----------------------
function blocoItensBoleto(inf) {
  if (!inf) return null;

  const linhaAvisoDivergencia = inf.divergente
    ? h('div', { class: 'aviso alerta' }, icone('alerta', 16), h('div', {},
      `Soma dos itens (${moeda(inf.somaItensCentavos)}) diverge do total do informativo (${moeda(inf.valorTotalCentavos)}).`))
    : null;

  const linhasTabela = inf.itens.map((item) => h('tr', {},
    h('td', {}, item.placa),
    h('td', {}, item.transportador),
    h('td', {}, mesAno(item.mesReferencia)),
    h('td', { class: 'num' }, moeda(item.valorCentavos))));

  const cabecalho = h('tr', {},
    h('th', {}, 'Placa'), h('th', {}, 'Transportador'), h('th', {}, 'Mês'), h('th', { class: 'num' }, 'Valor'));

  const tabela = h('table', {}, h('thead', {}, cabecalho), h('tbody', {}, ...linhasTabela));

  return h('div', {},
    h('h4', { style: 'margin:16px 0 8px' }, `Detalhamento por veículo (${inf.itens.length})`),
    linhaAvisoDivergencia,
    h('div', { class: 'tabela-envolve', style: 'max-height:220px;overflow-y:auto' }, tabela));
}

function abrirPreviaBoleto(resultado, aoTerminar) {
  const b = resultado.boleto;
  const inf = resultado.informativo;

  const form = h('form', {},
    b.avisos?.length ? h('div', { class: 'aviso alerta' }, icone('alerta', 16), h('div', {}, b.avisos.join(' '))) : null,
    h('div', { class: 'linha-campos' },
      campo('Documento', h('input', { type: 'text', name: 'documento', value: b.documento || '' })),
      campo('Vencimento', h('input', { type: 'date', name: 'vencimento', required: true, value: b.vencimento || '' }))),
    h('div', { class: 'linha-campos' },
      campo('Cliente', h('input', { type: 'text', name: 'clienteNome', required: true, value: b.clienteNome || '' })),
      campo('CNPJ/CPF do cliente', h('input', { type: 'text', name: 'clienteDoc', value: b.clienteDoc || '' }))),
    h('div', { class: 'linha-campos' },
      campo('Valor', h('input', {
        type: 'text', name: 'valor', required: true,
        value: b.valorCentavos != null ? (b.valorCentavos / 100).toFixed(2).replace('.', ',') : '',
      })),
      campo('Emissão', h('input', { type: 'date', name: 'emissao', value: b.emissao || '' }))),
    campo('Observação', h('textarea', { name: 'observacao', rows: '2' }, b.refNota ? `Ref. Nota ${b.refNota}` : '')),
    blocoItensBoleto(inf));

  modal({
    titulo: 'Conferir e importar',
    largo: true,
    corpo: form,
    acoes: [
      { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
      {
        rotulo: 'Confirmar e salvar',
        estilo: 'sucesso',
        aoClicar: async (fechar) => {
          const campos = lerFormulario(form);
          try {
            await api.post('/api/cobrancas/importar-boleto/confirmar', {
              idExterno: b.idExterno,
              documento: campos.documento,
              clienteNome: campos.clienteNome,
              clienteDoc: campos.clienteDoc,
              valor: campos.valor,
              emissao: campos.emissao,
              vencimento: campos.vencimento,
              observacao: campos.observacao,
              itens: (inf?.itens || []).map((item) => ({
                placa: item.placa, transportador: item.transportador,
                mesReferencia: item.mesReferencia, valor: item.valorCentavos / 100,
              })),
            });
            fechar();
            toast('Cobrança importada.', 'ok');
            aoTerminar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      },
    ],
  });
}

function abrirImportarBoleto(aoTerminar) {
  const inputBoleto = h('input', { type: 'file', accept: '.pdf,application/pdf', required: true });
  const inputInformativo = h('input', { type: 'file', accept: '.pdf,application/pdf' });

  const corpo = h('div', {},
    h('div', { class: 'aviso info' }, icone('relogio', 16),
      h('div', {}, 'O informativo (detalhamento por veículo) é opcional — sem ele, a cobrança é importada sem itens.')),
    campo('Boleto (PDF)', inputBoleto),
    campo('Informativo de veículos (PDF, opcional)', inputInformativo));

  modal({
    titulo: 'Importar boleto',
    largo: true,
    corpo,
    acoes: [
      { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
      {
        rotulo: 'Analisar',
        estilo: 'sucesso',
        aoClicar: async (fechar) => {
          if (!inputBoleto.files[0]) { toast('Escolha o PDF do boleto.', 'erro'); return; }
          const formData = new FormData();
          formData.append('boleto', inputBoleto.files[0]);
          if (inputInformativo.files[0]) formData.append('informativo', inputInformativo.files[0]);
          try {
            const resultado = await api.enviarArquivo('/api/cobrancas/importar-boleto', formData);
            fechar();
            abrirPreviaBoleto(resultado, aoTerminar);
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      },
    ],
  });
}

// ---------------------------- Cartão ----------------------------
function cartaoDaFatura(fatura, aoMudar) {
  const critico = fatura.promessaQuebrada || fatura.diasEmAtraso > 90;
  const cartao = h('div', {
    class: `cartao-funil tom-${TOM_ESTAGIO.get(fatura.estagio) || 'neutro'}`,
    draggable: 'true',
    dataset: { id: String(fatura.id) },
    onclick: () => abrirDetalhe(fatura.id, aoMudar),
  },
  h('div', { class: 'cliente', title: fatura.cliente }, fatura.cliente),
  h('div', { class: 'doc' }, [fatura.documento, fatura.origem].filter(Boolean).join(' · ')),
  h('div', { class: 'valor' }, moeda(fatura.saldoCentavos)),
  h('div', { class: 'rodape' },
    fatura.diasEmAtraso > 0
      ? etiqueta(`${fatura.diasEmAtraso}d em atraso`, critico ? 'critico' : 'alerta')
      : etiqueta(`vence ${data(fatura.vencimento)}`, 'neutro'),
    fatura.promessaQuebrada ? etiqueta('promessa quebrada', 'critico') : null,
    fatura.promessaEm && !fatura.promessaQuebrada ? etiqueta(`promete ${data(fatura.promessaEm)}`, 'info') : null,
    fatura.proximaAcaoEm && fatura.proximaAcaoEm <= hoje() ? etiqueta('ação hoje', 'alerta') : null));

  cartao.addEventListener('dragstart', (evento) => {
    evento.dataTransfer.setData('text/plain', String(fatura.id));
    evento.dataTransfer.effectAllowed = 'move';
    cartao.classList.add('arrastando');
  });
  cartao.addEventListener('dragend', () => cartao.classList.remove('arrastando'));

  return cartao;
}

// ---------------------------- Movimentação ----------------------------
// Estágios com exigência abrem um formulário antes de mover; os demais
// vão direto. É o mesmo caminho para arrastar e para o menu do detalhe.
async function moverFatura(id, destino, aoMudar) {
  const estagio = painel.estagios.find((e) => e.id === destino);
  if (!estagio) return;

  const precisaFormulario = estagio.exigeData || estagio.exigeJustificativa;

  if (!precisaFormulario) {
    try {
      await api.post(`/api/cobrancas/${id}/mover`, { para: destino });
      toast(`Movida para ${estagio.rotulo}.`, 'ok');
      aoMudar();
    } catch (erro) {
      toast(erro.message, 'erro');
    }
    return;
  }

  const form = h('form', {},
    estagio.exigeData
      ? campo('Data prometida pelo cliente',
        h('input', { type: 'date', name: 'promessaEm', min: hoje(), value: emDias(7), required: true }),
        'A fatura entra na sua agenda nesse dia; se passar sem pagamento, ela é marcada como promessa quebrada.')
      : null,
    estagio.exigeJustificativa
      ? campo('Justificativa',
        h('textarea', { name: 'justificativa', rows: '3', placeholder: 'Por que esta fatura está indo para este estágio?', required: true }))
      : null,
    campo('Próxima ação (opcional)', h('input', { type: 'text', name: 'proximaAcao', maxlength: '300', placeholder: 'Ex.: cobrar no dia da promessa' })),
    campo('Quando', h('input', { type: 'date', name: 'proximaAcaoEm', value: estagio.exigeData ? emDias(7) : '' })));

  modal({
    titulo: `Mover para ${estagio.rotulo}`,
    corpo: form,
    acoes: [
      { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
      {
        rotulo: 'Mover',
        estilo: '',
        aoClicar: async (fechar) => {
          try {
            await api.post(`/api/cobrancas/${id}/mover`, { para: destino, ...lerFormulario(form) });
            fechar();
            toast(`Movida para ${estagio.rotulo}.`, 'ok');
            aoMudar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      },
    ],
  });
}

// ---------------------------- Detalhe ----------------------------
async function abrirDetalhe(id, aoMudar) {
  const corpo = h('div', {}, carregando());
  const janela = modal({ titulo: 'Fatura', corpo, largo: true });

  const recarregarDetalhe = async () => {
    const fatura = await api.get(`/api/cobrancas/${id}`);
    janela.elemento.querySelector('.modal-cabeca h3').textContent =
      `${fatura.documento || 'Fatura'} · ${fatura.cliente}`;

    if (!usuariosCache) usuariosCache = await api.get('/api/usuarios');

    // ---- topo: números e estágio ----
    const topo = h('div', { class: 'linha-campos', style: 'margin-bottom:16px' },
      indicador({ rotulo: 'Saldo em aberto', valor: moeda(fatura.saldoCentavos), tom: fatura.atrasada ? 'critico' : '' }),
      indicador({ rotulo: 'Vencimento', valor: h('span', { style: 'font-size:16px' }, data(fatura.vencimento)),
        nota: fatura.diasEmAtraso > 0 ? `${fatura.diasEmAtraso} dias em atraso` : 'em dia' }),
      indicador({ rotulo: 'Valor original', valor: h('span', { style: 'font-size:16px' }, moeda(fatura.valorCentavos)),
        nota: fatura.valorPagoCentavos ? `pago ${moeda(fatura.valorPagoCentavos)}` : 'nada recebido' }),
      indicador({ rotulo: 'Origem', valor: h('span', { style: 'font-size:16px' }, fatura.origem),
        nota: fatura.statusOrigem || '—' }));

    // ---- mover ----
    const seletorEstagio = selecao('estagio', painel.estagios.map((e) => ({ valor: e.id, rotulo: e.rotulo })), fatura.estagio);
    seletorEstagio.addEventListener('change', async () => {
      if (seletorEstagio.value === fatura.estagio) return;
      await moverFatura(fatura.id, seletorEstagio.value, () => { recarregarDetalhe(); aoMudar(); });
    });

    const seletorResponsavel = selecao('responsavel',
      [{ valor: '', rotulo: 'Sem responsável' }, ...usuariosCache.map((u) => ({ valor: u.email, rotulo: u.nome }))],
      fatura.responsavel || '');
    seletorResponsavel.addEventListener('change', async () => {
      try {
        await api.post(`/api/cobrancas/${fatura.id}/responsavel`, { responsavel: seletorResponsavel.value || null });
        toast('Responsável atualizado.', 'ok');
        aoMudar();
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    });

    const controles = h('div', { class: 'linha-campos', style: 'margin-bottom:16px' },
      campo('Estágio no funil', seletorEstagio),
      campo('Responsável', seletorResponsavel));

    // ---- emissão de boleto: estrutura pronta, desligada sem convênio ----
    const emissaoBoleto = sessao()?.integracoes?.emissaoBoleto
      ? h('button', {
        class: 'botao secundario', type: 'button',
        onclick: async (evento) => {
          const botao = evento.currentTarget;
          botao.disabled = true;
          try {
            await api.post(`/api/cobrancas/${fatura.id}/emitir-boleto`);
            toast('Boleto emitido.', 'ok');
            await recarregarDetalhe();
          } catch (erro) {
            toast(erro.message, 'erro');
          } finally {
            botao.disabled = false;
          }
        },
      }, icone('enviar'), 'Emitir boleto')
      : h('div', { class: 'aviso info', style: 'margin-bottom:16px' }, icone('relogio', 16),
        h('div', {}, h('b', {}, 'Emissão de boleto não configurada. '),
          'Requer convênio Sicredi (SICREDI_CLIENT_ID e demais — ver .env.example). O boleto pode ser importado em PDF na tela de Cobranças.'));

    // ---- registrar contato ----
    const formContato = h('form', {},
      h('div', { class: 'linha-campos' },
        campo('Tipo de contato', selecao('tipo', [
          { valor: 'ligacao', rotulo: 'Ligação' }, { valor: 'email', rotulo: 'E-mail' },
          { valor: 'whatsapp', rotulo: 'WhatsApp' }, { valor: 'reuniao', rotulo: 'Reunião' },
          { valor: 'nota', rotulo: 'Anotação' },
        ])),
        campo('Próxima ação em', h('input', { type: 'date', name: 'proximaAcaoEm' }))),
      campo('O que foi tratado', h('textarea', { name: 'resumo', rows: '2', placeholder: 'Com quem falou, o que ficou combinado…', required: true })),
      campo('Próxima ação', h('input', { type: 'text', name: 'proximaAcao', maxlength: '300', placeholder: 'Ex.: reenviar boleto atualizado' })));

    const botaoContato = h('button', { class: 'botao', type: 'submit' }, icone('telefone'), 'Registrar contato');
    formContato.append(h('div', { style: 'display:flex;justify-content:flex-end' }, botaoContato));
    formContato.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      botaoContato.disabled = true;
      try {
        await api.post(`/api/cobrancas/${fatura.id}/interacoes`, lerFormulario(formContato));
        toast('Contato registrado na régua.', 'ok');
        await recarregarDetalhe();
        aoMudar();
      } catch (erro) {
        toast(erro.message, 'erro');
      } finally {
        botaoContato.disabled = false;
      }
    });

    // ---- régua ----
    const regua = h('ul', { class: 'timeline' });
    if (!fatura.interacoes.length) {
      regua.append(h('li', { class: 'silencioso', style: 'font-size:12.5px' }, 'Nenhum contato registrado ainda.'));
    }
    for (const interacao of fatura.interacoes) {
      regua.append(h('li', { class: interacao.tipo === 'estagio' ? 'atual' : 'feito' },
        h('div', { class: 'quando' }, `${dataHora(interacao.criado_em)} · ${interacao.autor_email}`),
        h('div', { class: 'titulo' }, interacao.tipo === 'estagio'
          ? `Movida para ${nomeDoEstagio(interacao.para_estagio)}`
          : rotuloTipo(interacao.tipo)),
        h('div', { class: 'texto' }, interacao.resumo)));
    }

    // ---- outras faturas do cliente ----
    const outras = fatura.outrasDoCliente.length
      ? h('div', { class: 'cartao', style: 'margin-top:16px' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, `Outras faturas em aberto de ${fatura.cliente}`)),
        h('div', { class: 'cartao-corpo sem-espaco' }, h('div', { class: 'tabela-envolve' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Documento'), h('th', {}, 'Vencimento'), h('th', {}, 'Estágio'), h('th', { class: 'num' }, 'Valor'))),
          h('tbody', {}, ...fatura.outrasDoCliente.map((outra) => h('tr', {
            class: 'clicavel',
            onclick: () => { janela.fechar(); abrirDetalhe(outra.id, aoMudar); },
          },
          h('td', {}, outra.documento || '—'),
          h('td', {}, data(outra.vencimento)),
          h('td', {}, etiqueta(nomeDoEstagio(outra.estagio), TOM_ESTAGIO.get(outra.estagio) || 'neutro')),
          h('td', { class: 'num forte' }, moeda(outra.valor_centavos)))))))))
      : null;

    limpar(corpo).append(
      fatura.promessaQuebrada
        ? h('div', { class: 'aviso critico' }, icone('alerta', 16),
          h('div', {}, h('b', {}, 'Promessa quebrada. '), `O cliente prometeu pagar em ${data(fatura.promessaEm)} e não pagou.`))
        : null,
      fatura.proximaAcao && fatura.proximaAcaoEm && fatura.proximaAcaoEm <= hoje()
        ? h('div', { class: 'aviso alerta' }, icone('relogio', 16),
          h('div', {}, h('b', {}, 'Ação pendente: '), fatura.proximaAcao))
        : null,
      topo,
      controles,
      emissaoBoleto,
      h('div', { class: 'grade duas' },
        h('div', {}, h('h3', { style: 'font-size:13px;margin-bottom:10px' }, 'Registrar contato'), formContato),
        h('div', {}, h('h3', { style: 'font-size:13px;margin-bottom:10px' }, 'Régua de cobrança'), regua)),
      outras,
    );
  };

  await recarregarDetalhe();
}

const nomeDoEstagio = (id) => painel?.estagios.find((e) => e.id === id)?.rotulo || id || '—';
const rotuloTipo = (tipo) => ({
  ligacao: 'Ligação', email: 'E-mail', whatsapp: 'WhatsApp', reuniao: 'Reunião', nota: 'Anotação', promessa: 'Promessa',
}[tipo] || tipo);

// ---------------------------- Visão: funil ----------------------------
function desenharFunil(dados, aoMudar) {
  const quadro = h('div', { class: 'funil' });
  const maiorSaldo = Math.max(1, ...dados.funil.map((c) => c.saldoCentavos));

  for (const coluna of dados.funil) {
    const lista = h('div', { class: 'coluna-lista' });
    if (!coluna.cartoes.length) {
      lista.append(h('div', { class: 'silencioso', style: 'font-size:11.5px;padding:8px 4px' }, 'Vazio'));
    }
    for (const fatura of coluna.cartoes) lista.append(cartaoDaFatura(fatura, aoMudar));

    const elemento = h('div', { class: `coluna tom-${coluna.tom}`, dataset: { estagio: coluna.id } },
      h('div', { class: 'coluna-cabeca' },
        h('div', { class: 'coluna-titulo' },
          h('span', { class: 'ponto-tom' }),
          h('span', {}, coluna.rotulo),
          h('span', { class: 'contagem' }, String(coluna.quantidade))),
        h('div', { class: 'coluna-valor' }, moeda(coluna.saldoCentavos)),
        coluna.promessasQuebradas
          ? h('div', { style: 'margin-top:6px' }, etiqueta(`${coluna.promessasQuebradas} quebrada(s)`, 'critico'))
          : null,
        h('div', { class: 'coluna-barra' },
          h('i', { style: `width:${Math.round((coluna.saldoCentavos / maiorSaldo) * 100)}%` }))),
      lista);

    elemento.addEventListener('dragover', (evento) => {
      evento.preventDefault();
      evento.dataTransfer.dropEffect = 'move';
      elemento.classList.add('arrastando-sobre');
    });
    elemento.addEventListener('dragleave', () => elemento.classList.remove('arrastando-sobre'));
    elemento.addEventListener('drop', async (evento) => {
      evento.preventDefault();
      elemento.classList.remove('arrastando-sobre');
      const id = Number(evento.dataTransfer.getData('text/plain'));
      if (!id) return;
      const origem = dados.funil.find((c) => c.cartoes.some((f) => f.id === id));
      if (origem?.id === coluna.id) return;
      await moverFatura(id, coluna.id, aoMudar);
    });

    quadro.append(elemento);
  }
  return quadro;
}

// ---------------------------- Visão: lista ----------------------------
async function desenharLista(aoMudar) {
  const faturas = await api.get(comQuery('/api/cobrancas', filtros));
  if (!faturas.length) return vazio('Nenhuma fatura', 'Ajuste os filtros ou importe a carteira em Fontes e integrações.');

  const corpo = h('tbody', {});
  for (const fatura of faturas) {
    corpo.append(h('tr', { class: 'clicavel', onclick: () => abrirDetalhe(fatura.id, aoMudar) },
      h('td', {}, h('div', { class: 'forte' }, fatura.cliente),
        h('div', { class: 'silencioso', style: 'font-size:11px' }, [fatura.documento, fatura.clienteDoc].filter(Boolean).join(' · '))),
      h('td', {}, etiqueta(fatura.estagioRotulo, TOM_ESTAGIO.get(fatura.estagio) || 'neutro')),
      h('td', {}, data(fatura.vencimento),
        fatura.diasEmAtraso > 0
          ? h('div', { style: 'font-size:11px;color:var(--critico);font-weight:700' }, `${fatura.diasEmAtraso}d em atraso`)
          : null),
      h('td', { class: 'num forte' }, moeda(fatura.saldoCentavos)),
      h('td', {}, fatura.responsavel || h('span', { class: 'silencioso' }, '—')),
      h('td', {}, fatura.proximaAcao
        ? h('div', {}, h('div', { style: 'font-size:12px' }, fatura.proximaAcao),
          h('div', { class: 'silencioso', style: 'font-size:11px' }, data(fatura.proximaAcaoEm)))
        : h('span', { class: 'silencioso' }, '—')),
      h('td', { class: 'silencioso', style: 'font-size:11.5px' }, fatura.origem)));
  }

  return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo sem-espaco' },
    h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Cliente'), h('th', {}, 'Estágio'), h('th', {}, 'Vencimento'),
        h('th', { class: 'num' }, 'Saldo'), h('th', {}, 'Responsável'), h('th', {}, 'Próxima ação'), h('th', {}, 'Origem'))),
      corpo))));
}

// ---------------------------- Visão: clientes ----------------------------
function desenharClientes(clientes) {
  if (!clientes.length) return vazio('Nenhum cliente com saldo em aberto');

  const corpo = h('tbody', {});
  for (const cliente of clientes) {
    corpo.append(h('tr', { class: 'clicavel', onclick: () => { filtros.busca = cliente.cliente; visao = 'lista'; document.dispatchEvent(new CustomEvent('cobrancas:recarregar')); } },
      h('td', {}, h('div', { class: 'forte' }, cliente.cliente),
        cliente.documento ? h('div', { class: 'silencioso', style: 'font-size:11px' }, cliente.documento) : null),
      h('td', { class: 'num' }, cliente.faturas),
      h('td', { class: 'num forte' }, moeda(cliente.aberto)),
      h('td', { class: 'num' }, cliente.vencido
        ? h('span', { style: 'color:var(--critico);font-weight:700' }, moeda(cliente.vencido))
        : h('span', { class: 'silencioso' }, '—')),
      h('td', { class: 'num' }, cliente.maiorAtraso > 0 ? `${cliente.maiorAtraso}d` : '—')));
  }

  return h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo sem-espaco' },
    h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Cliente'), h('th', { class: 'num' }, 'Faturas'),
        h('th', { class: 'num' }, 'Em aberto'), h('th', { class: 'num' }, 'Vencido'), h('th', { class: 'num' }, 'Maior atraso'))),
      corpo))));
}

// ---------------------------- Aging ----------------------------
function desenharAging(faixas) {
  const maior = Math.max(1, ...faixas.map((f) => f.saldoCentavos));
  const cores = {
    a_vencer: 'var(--ok)', d1_30: 'var(--ambar)', d31_60: 'var(--brasa)',
    d61_90: 'var(--laranja)', d90mais: 'var(--critico)',
  };
  return h('div', { class: 'aging' }, ...faixas.map((faixa) => h('div', { class: 'aging-linha' },
    h('div', { class: 'nome' }, faixa.rotulo),
    h('div', { class: 'aging-barra' },
      h('i', { style: `width:${Math.max(2, Math.round((faixa.saldoCentavos / maior) * 100))}%;background:${cores[faixa.id]}` })),
    h('div', { class: 'total' }, moedaCurta(faixa.saldoCentavos), h('span', { class: 'silencioso', style: 'font-weight:500' }, ` · ${faixa.quantidade}`)))));
}

// ------------------------------- Tela -------------------------------
export async function montar(ctx) {
  const raiz = h('div', {});
  const areaIndicadores = h('div', { class: 'indicadores' });
  const areaFiltros = h('div', { class: 'entre', style: 'flex-wrap:wrap;gap:8px;margin-bottom:16px' });
  const areaPrincipal = h('div', {}, carregando());
  const areaLateral = h('div', { class: 'pilha', style: 'gap:16px' });

  const { estagios, faixas } = await api.get('/api/cobrancas/estagios');
  for (const estagio of estagios) TOM_ESTAGIO.set(estagio.id, estagio.tom);

  const recarregar = async () => {
    limpar(areaPrincipal).append(carregando());
    const dados = await api.get(comQuery('/api/cobrancas/painel', filtros));
    painel = { ...dados, estagios, faixas };

    const k = dados.indicadores;
    limpar(areaIndicadores).append(
      indicador({ rotulo: 'Carteira em aberto', valor: moeda(k.abertoCentavos), nota: `${k.faturas} faturas na base` }),
      indicador({ rotulo: 'Vencido', valor: moeda(k.vencidoCentavos), tom: 'critico', nota: `${k.percentualVencido}% da carteira` }),
      indicador({ rotulo: 'Recebido', valor: moeda(k.recebidoCentavos), tom: 'ok',
        nota: k.taxaRecuperacao === null ? 'sem histórico' : `${k.taxaRecuperacao}% de recuperação` }),
      indicador({ rotulo: 'Prazo médio', valor: k.prazoMedioRecebimento === null ? '—' : `${k.prazoMedioRecebimento}d`,
        nota: k.dso === null ? 'sem base de cálculo' : `DSO ${k.dso} dias` }),
      indicador({ rotulo: 'No jurídico', valor: moedaCurta(k.juridicoCentavos), tom: 'alerta',
        nota: `${k.promessasQuebradas} promessa(s) quebrada(s)` }),
    );

    const emAberto = dados.funil.filter((c) => !['paga', 'perda'].includes(c.id))
      .reduce((soma, c) => soma + c.quantidade, 0);
    ctx.definirDistintivo('cobrancas', emAberto, k.promessasQuebradas > 0);

    // ---- lateral: aging, agenda, fontes ----
    limpar(areaLateral).append(
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Aging da carteira')),
        h('div', { class: 'cartao-corpo' }, desenharAging(dados.aging))),

      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, 'Agenda de hoje'),
          h('span', { class: 'acoes' }, etiqueta(String(dados.agenda.length), dados.agenda.length ? 'alerta' : 'neutro'))),
        h('div', { class: 'cartao-corpo', style: 'max-height:280px;overflow-y:auto' },
          dados.agenda.length
            ? h('div', { class: 'pilha', style: 'gap:10px' }, ...dados.agenda.slice(0, 12).map((fatura) => h('div', {
              style: 'cursor:pointer;border-bottom:1px solid var(--linha);padding-bottom:8px',
              onclick: () => abrirDetalhe(fatura.id, recarregar),
            },
            h('div', { class: 'entre' },
              h('b', { style: 'font-size:12.5px' }, fatura.cliente),
              h('span', { class: 'direita forte mono', style: 'font-size:12.5px' }, moedaCurta(fatura.saldoCentavos))),
            h('div', { class: 'silencioso', style: 'font-size:11.5px' }, fatura.proximaAcao || 'Sem ação descrita'))))
            : h('div', { class: 'silencioso', style: 'font-size:12.5px' }, 'Nada agendado para hoje. Carteira em dia.'))),

      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Maiores devedores')),
        h('div', { class: 'cartao-corpo', style: 'max-height:300px;overflow-y:auto' },
          dados.clientes.length
            ? h('div', { class: 'pilha', style: 'gap:9px' }, ...dados.clientes.slice(0, 8).map((cliente) => h('div', { class: 'entre' },
              h('span', { style: 'font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, cliente.cliente),
              h('span', { class: 'direita mono forte', style: `font-size:12.5px;${cliente.vencido ? 'color:var(--critico)' : ''}` },
                moedaCurta(cliente.aberto)))))
            : h('div', { class: 'silencioso', style: 'font-size:12.5px' }, 'Nenhum saldo em aberto.'))),
    );

    // ---- principal ----
    if (visao === 'funil') limpar(areaPrincipal).append(desenharFunil(dados, recarregar));
    else if (visao === 'clientes') limpar(areaPrincipal).append(desenharClientes(dados.clientes.length ? await api.get(comQuery('/api/cobrancas/clientes', filtros)) : []));
    else limpar(areaPrincipal).append(await desenharLista(recarregar));
  };

  document.addEventListener('cobrancas:recarregar', () => { desenharFiltros(); recarregar(); });

  // ---- filtros ----
  const campoBusca = h('input', { type: 'search', placeholder: 'Cliente, documento ou CNPJ', value: filtros.busca, style: 'width:230px' });
  let temporizador;
  campoBusca.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { filtros.busca = campoBusca.value.trim(); recarregar(); }, 300);
  });

  function desenharFiltros() {
    campoBusca.value = filtros.busca;
    limpar(areaFiltros).append(
      h('div', { style: 'display:flex;gap:2px;background:var(--neutro-fundo);padding:3px;border-radius:8px' },
        ...[['funil', 'Funil'], ['lista', 'Lista'], ['clientes', 'Clientes']].map(([chave, rotulo]) => h('button', {
          class: `pilula-filtro ${visao === chave ? 'on' : ''}`,
          style: 'border:0;background:' + (visao === chave ? 'var(--texto)' : 'transparent'),
          type: 'button',
          onclick: () => { visao = chave; desenharFiltros(); recarregar(); },
        }, rotulo))),
      campoBusca,
      (() => {
        const seletor = selecao('faixa', [
          { valor: '', rotulo: 'Todo o aging' },
          ...faixas.map((f) => ({ valor: f.id, rotulo: f.rotulo })),
        ], filtros.faixa);
        seletor.style.width = '170px';
        seletor.addEventListener('change', () => { filtros.faixa = seletor.value; recarregar(); });
        return seletor;
      })(),
      h('button', {
        class: `pilula-filtro ${filtros.apenasAtrasadas ? 'on' : ''}`,
        type: 'button',
        onclick: () => { filtros.apenasAtrasadas = !filtros.apenasAtrasadas; desenharFiltros(); recarregar(); },
      }, 'Só atrasadas'),
      h('button', {
        class: `pilula-filtro ${filtros.apenasAbertas ? 'on' : ''}`,
        type: 'button',
        onclick: () => { filtros.apenasAbertas = !filtros.apenasAbertas; desenharFiltros(); recarregar(); },
      }, 'Esconder encerradas'),
      (filtros.busca || filtros.faixa || filtros.apenasAtrasadas || filtros.apenasAbertas)
        ? h('button', {
          class: 'botao fantasma pequeno',
          type: 'button',
          onclick: () => {
            Object.assign(filtros, { busca: '', faixa: '', apenasAtrasadas: false, apenasAbertas: false });
            desenharFiltros();
            recarregar();
          },
        }, 'Limpar')
        : null,
    );
  }

  ctx.definirCabecalho({
    titulo: 'Cobranças',
    subtitulo: 'Carteira de recebíveis consolidada — o estágio do funil é controlado aqui',
    acoes: [
      botaoAnaliseIA('Cobranças', () => {
        if (!painel) return 'Sem dados de cobrança carregados.';
        const k = painel.indicadores;
        const totalFunil = (painel.funil || []).map((c) => `${c.rotulo}: ${c.quantidade} faturas (R$ ${(c.saldoCentavos / 100).toFixed(2)})`).join('\n');
        return `Carteira em aberto: R$ ${(k.abertoCentavos / 100).toFixed(2)} (${k.faturas} faturas)\nVencido: R$ ${(k.vencidoCentavos / 100).toFixed(2)} (${k.percentualVencido}% da carteira)\nRecebido: R$ ${(k.recebidoCentavos / 100).toFixed(2)}\nNo jurídico: R$ ${(k.juridicoCentavos / 100).toFixed(2)}\nPromessas quebradas: ${k.promessasQuebradas}\n\nFunil de Cobrança:\n${totalFunil}`;
      }, raiz),
      h('button', {
        class: 'botao secundario', type: 'button',
        onclick: () => abrirImportarBoleto(recarregar),
      }, icone('enviar'), 'Importar boleto'),
      h('a', {
        class: 'botao secundario',
        href: comQuery('/api/cobrancas/exportar', filtros),
      }, icone('baixar'), 'Exportar CSV'),
      h('button', { class: 'botao secundario', type: 'button', onclick: async (evento) => {
        const botao = evento.currentTarget;
        botao.disabled = true;
        try {
          const resultado = await api.post('/api/sincronizar');
          const puxados = resultado.cobrancas.fontes.filter((f) => !f.pulado);
          toast(puxados.length
            ? `Sincronizado: ${puxados.map((f) => `${f.fonte} (${f.registros ?? 0})`).join(', ')}.`
            : 'Nenhuma fonte externa configurada — nada a puxar.', 'ok');
          await recarregar();
        } catch (erro) {
          toast(erro.message, 'erro');
        } finally {
          botao.disabled = false;
        }
      } }, icone('atualizar'), 'Sincronizar fontes'),
    ],
  });

  desenharFiltros();
  raiz.append(
    areaIndicadores,
    areaFiltros,
    h('div', { class: 'grade lateral-direita' }, areaPrincipal, areaLateral),
  );

  await recarregar();
  return raiz;
}
