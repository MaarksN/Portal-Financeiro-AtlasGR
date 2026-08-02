import { api, comQuery } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, confirmar, campo, selecao, lerFormulario,
  data, dataHora, desdeQuando, vazio, carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

// Chamados — o Jira é o dono do ciclo de vida; esta tela abre, lista e
// acompanha. O portal mantém protocolo próprio para o solicitante ter
// uma referência mesmo quando o Jira está fora do ar.

const filtros = { status: '', prioridade: '', busca: '' };

const TOM_STATUS = { todo: 'neutro', andamento: 'info', concluido: 'ok' };
const TOM_PRIORIDADE = { 'Crítica': 'critico', Alta: 'alerta', Normal: 'info', Baixa: 'neutro' };

function etiquetaSla(chamado) {
  if (chamado.statusCategoria === 'concluido') return etiqueta('Concluído', 'ok');
  if (!chamado.slaVenceEm) return etiqueta('—', 'neutro');
  if (chamado.slaViolado) return etiqueta('SLA estourado', 'critico');

  const horas = (new Date(chamado.slaVenceEm) - Date.now()) / 3600000;
  if (horas < 0) return etiqueta('SLA estourado', 'critico');
  if (horas < 4) return etiqueta(`Vence em ${Math.max(1, Math.round(horas))}h`, 'alerta');
  if (horas < 24) return etiqueta(`Vence em ${Math.round(horas)}h`, 'info');
  return etiqueta(`Vence em ${Math.round(horas / 24)}d`, 'neutro');
}

// ------------------------------ Detalhe ------------------------------
async function abrirDetalhe(id, aoMudar) {
  const corpo = h('div', {}, carregando());
  const janela = modal({ titulo: 'Chamado', corpo, largo: true });

  const chamado = await api.get(`/api/chamados/${id}`);
  janela.elemento.querySelector('.modal-cabeca h3').textContent = `${chamado.protocolo} · ${chamado.resumo}`;

  const linhaResumo = h('div', { class: 'linha-campos', style: 'margin-bottom:18px' },
    indicador({ rotulo: 'Status', valor: h('span', { style: 'font-size:15px' }, chamado.status) }),
    indicador({ rotulo: 'Prioridade', valor: h('span', { style: 'font-size:15px' }, chamado.prioridade) }),
    indicador({ rotulo: 'Responsável', valor: h('span', { style: 'font-size:15px' }, chamado.responsavel || 'Não atribuído') }),
    indicador({ rotulo: 'Prazo (SLA)', valor: h('span', { style: 'font-size:15px' }, chamado.slaVenceEm ? dataHora(chamado.slaVenceEm) : '—') }));

  const ficha = h('div', { class: 'cartao', style: 'margin-bottom:16px' },
    h('div', { class: 'cartao-corpo' },
      h('div', { class: 'entre', style: 'margin-bottom:10px' },
        etiqueta(chamado.categoria, 'neutro'),
        etiqueta(chamado.prioridade, TOM_PRIORIDADE[chamado.prioridade] || 'neutro'),
        etiquetaSla(chamado),
        chamado.chaveJira
          ? h('span', { class: 'direita silencioso', style: 'font-size:12px' },
            chamado.urlJira
              ? h('a', { href: chamado.urlJira, target: '_blank', rel: 'noopener', class: 'entre' },
                chamado.chaveJira, icone('externo', 13))
              : chamado.chaveJira)
          : null),
      h('p', { style: 'margin:0;white-space:pre-wrap;font-size:13.5px;color:var(--texto2)' },
        chamado.descricao || 'Sem descrição.'),
      h('div', { class: 'silencioso', style: 'font-size:11.5px;margin-top:12px' },
        `Aberto por ${chamado.solicitante} · ${dataHora(chamado.criadoEm)}`)));

  const listaComentarios = h('div', { class: 'pilha', style: 'gap:12px' });
  const desenharComentarios = () => {
    limpar(listaComentarios);
    if (!chamado.comentarios?.length) {
      listaComentarios.append(h('div', { class: 'silencioso', style: 'font-size:12.5px' },
        chamado.chaveJira ? 'Nenhum comentário ainda.' : 'Comentários ficam disponíveis quando o chamado sincroniza com o Jira.'));
      return;
    }
    for (const comentario of chamado.comentarios) {
      listaComentarios.append(h('div', { style: 'border-left:2px solid var(--linha);padding-left:12px' },
        h('div', { class: 'entre' },
          h('b', { style: 'font-size:12.5px' }, comentario.autor),
          h('span', { class: 'direita silencioso', style: 'font-size:11px' }, desdeQuando(comentario.criadoEm))),
        h('div', { style: 'font-size:13px;white-space:pre-wrap;color:var(--texto2);margin-top:2px' }, comentario.texto)));
    }
  };
  desenharComentarios();

  const caixaComentario = h('textarea', {
    name: 'texto', rows: '2', placeholder: 'Escreva um comentário para a equipe de TI…',
  });
  const botaoComentar = h('button', { class: 'botao', type: 'submit' }, icone('enviar'), 'Comentar');

  const formComentario = h('form', { style: 'margin-top:14px' },
    caixaComentario,
    h('div', { style: 'margin-top:8px;display:flex;justify-content:flex-end' }, botaoComentar));

  formComentario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const texto = caixaComentario.value.trim();
    if (!texto) return;
    botaoComentar.disabled = true;
    try {
      await api.post(`/api/chamados/${id}/comentarios`, { texto });
      caixaComentario.value = '';
      const atualizado = await api.get(`/api/chamados/${id}`);
      chamado.comentarios = atualizado.comentarios;
      desenharComentarios();
      toast('Comentário enviado ao Jira.', 'ok');
      if (aoMudar) aoMudar();
    } catch (erro) {
      toast(erro.message, 'erro');
    } finally {
      botaoComentar.disabled = false;
    }
  });

  limpar(corpo).append(
    chamado.avisoSincronizacao
      ? h('div', { class: 'aviso alerta' }, icone('alerta', 16), h('div', {}, chamado.avisoSincronizacao))
      : null,
    linhaResumo,
    ficha,
    h('h3', { style: 'font-size:13px;margin-bottom:10px' }, 'Conversa'),
    listaComentarios,
    chamado.chaveJira ? formComentario : null,
  );
}

// ------------------------------ Abertura ------------------------------
async function abrirFormulario(aoCriar) {
  const opcoes = await api.get('/api/chamados/opcoes');

  const form = h('form', { id: 'form-chamado' },
    campo('Categoria', selecao('categoria', ['', ...opcoes.categorias].map((c) => ({ valor: c, rotulo: c || 'Selecione…' })))),
    campo('Prioridade', selecao('prioridade', ['', ...opcoes.prioridades].map((p) => ({ valor: p, rotulo: p || 'Selecione…' }))),
      'Crítica: 4h · Alta: 8h · Normal: 24h · Baixa: 72h'),
    campo('Assunto', h('input', { type: 'text', name: 'resumo', maxlength: '200', placeholder: 'Ex.: Não consigo acessar o Connect Plus', required: true })),
    campo('Descrição', h('textarea', { name: 'descricao', rows: '5', placeholder: 'O que acontece, desde quando, o que você já tentou. Quanto mais detalhe, menos idas e vindas.' })));

  const janela = modal({
    titulo: 'Abrir chamado',
    corpo: form,
    acoes: [
      { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
      {
        rotulo: 'Abrir chamado',
        estilo: '',
        aoClicar: async (fechar) => {
          const dados = lerFormulario(form);
          if (!dados.categoria || !dados.prioridade || !dados.resumo) {
            toast('Preencha categoria, prioridade e assunto.', 'erro');
            return;
          }
          try {
            const chamado = await api.post('/api/chamados', dados);
            fechar();
            toast(`Chamado ${chamado.protocolo} aberto.`, 'ok');
            aoCriar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      },
    ],
  });
  return janela;
}

// ------------------------------- Tela -------------------------------
export async function montar(ctx) {
  const raiz = h('div', {});
  const areaResumo = h('div', { class: 'indicadores' });
  const areaTabela = h('div', { class: 'cartao-corpo sem-espaco' }, carregando());

  const recarregar = async () => {
    limpar(areaTabela).append(carregando());
    const [resumo, lista] = await Promise.all([
      api.get('/api/chamados/resumo'),
      api.get(comQuery('/api/chamados', filtros)),
    ]);

    limpar(areaResumo).append(
      indicador({ rotulo: 'Em aberto', valor: resumo.abertos, nota: `${resumo.naFila} na fila · ${resumo.emAndamento} em andamento` }),
      indicador({ rotulo: 'SLA estourado', valor: resumo.slaViolado, tom: resumo.slaViolado ? 'critico' : '', nota: 'chamados fora do prazo' }),
      indicador({ rotulo: 'Concluídos', valor: resumo.concluidos, tom: 'ok', nota: 'histórico completo' }),
    );
    ctx.definirDistintivo('chamados', resumo.abertos, resumo.slaViolado > 0);

    if (!lista.length) {
      limpar(areaTabela).append(vazio(
        'Nenhum chamado por aqui',
        filtros.busca || filtros.status || filtros.prioridade
          ? 'Nenhum resultado com os filtros atuais.'
          : 'Quando você abrir um chamado, ele aparece aqui com o prazo de atendimento.',
      ));
      return;
    }

    const corpo = h('tbody', {});
    for (const chamado of lista) {
      corpo.append(h('tr', { class: 'clicavel', onclick: () => abrirDetalhe(chamado.id, recarregar) },
        h('td', {}, h('div', { class: 'forte' }, chamado.protocolo),
          chamado.chaveJira ? h('div', { class: 'silencioso', style: 'font-size:11px' }, chamado.chaveJira) : null),
        h('td', {}, h('div', { style: 'max-width:340px' }, chamado.resumo),
          h('div', { class: 'silencioso', style: 'font-size:11px' }, chamado.categoria)),
        h('td', {}, etiqueta(chamado.prioridade, TOM_PRIORIDADE[chamado.prioridade] || 'neutro')),
        h('td', {}, etiqueta(chamado.status, TOM_STATUS[chamado.statusCategoria] || 'neutro')),
        h('td', {}, etiquetaSla(chamado)),
        h('td', {}, chamado.responsavel || h('span', { class: 'silencioso' }, 'Não atribuído')),
        h('td', { class: 'silencioso', style: 'font-size:12px' }, data(chamado.criadoEm))));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, 'Protocolo'), h('th', {}, 'Assunto'), h('th', {}, 'Prioridade'),
          h('th', {}, 'Status'), h('th', {}, 'Prazo'), h('th', {}, 'Responsável'), h('th', {}, 'Abertura'))),
        corpo)));
  };

  const campoBusca = h('input', { type: 'search', placeholder: 'Protocolo, assunto ou chave do Jira', value: filtros.busca });
  let temporizador;
  campoBusca.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { filtros.busca = campoBusca.value.trim(); recarregar(); }, 300);
  });

  const seletorStatus = selecao('status', [
    { valor: '', rotulo: 'Todos os status' },
    { valor: 'todo', rotulo: 'Na fila' },
    { valor: 'andamento', rotulo: 'Em andamento' },
    { valor: 'concluido', rotulo: 'Concluídos' },
  ], filtros.status);
  seletorStatus.addEventListener('change', () => { filtros.status = seletorStatus.value; recarregar(); });

  const seletorPrioridade = selecao('prioridade', [
    { valor: '', rotulo: 'Todas as prioridades' },
    'Crítica', 'Alta', 'Normal', 'Baixa',
  ], filtros.prioridade);
  seletorPrioridade.addEventListener('change', () => { filtros.prioridade = seletorPrioridade.value; recarregar(); });

  ctx.definirCabecalho({
    titulo: 'Chamados',
    subtitulo: 'Abertos no Jira pela equipe de TI, com espelho no Bitrix',
    acoes: [
      h('button', { class: 'botao secundario', type: 'button', onclick: async (evento) => {
        const botao = evento.currentTarget;
        botao.disabled = true;
        try {
          const resultado = await api.post('/api/chamados/sincronizar');
          toast(resultado.pulado ? `Sincronização pulada: ${resultado.motivo}.` : `${resultado.atualizados} chamado(s) atualizados do Jira.`, 'ok');
          await recarregar();
        } catch (erro) {
          toast(erro.message, 'erro');
        } finally {
          botao.disabled = false;
        }
      } }, icone('atualizar'), 'Sincronizar'),
      h('button', { class: 'botao', type: 'button', onclick: () => abrirFormulario(recarregar) }, icone('mais'), 'Abrir chamado'),
    ],
  });

  raiz.append(
    areaResumo,
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-cabeca' },
        h('h3', {}, 'Meus chamados'),
        h('div', { class: 'acoes' },
          h('div', { style: 'width:250px' }, campoBusca),
          seletorStatus,
          seletorPrioridade)),
      areaTabela),
  );

  await recarregar();
  return raiz;
}
