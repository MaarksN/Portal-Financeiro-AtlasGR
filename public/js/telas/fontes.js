import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, moeda, dataHora, desdeQuando,
  vazio, carregando, etiqueta, indicador,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Fontes e integrações: onde o financeiro/TI vê de onde vêm as
// cobranças, força uma sincronização, importa carteira por CSV e
// acompanha a fila do espelho Jira -> Bitrix.
// ------------------------------------------------------------------

function importarCsv(aoTerminar) {
  const entrada = h('input', { type: 'file', accept: '.csv,text/csv', name: 'arquivo' });
  const corpo = h('div', {},
    h('div', { class: 'aviso info' }, icone('relogio', 16),
      h('div', {},
        h('b', {}, 'Colunas reconhecidas: '),
        'cliente, documento/nf, valor, vencimento, emissão, pagamento, cnpj, status. ',
        'Separador ; ou , — o cabeçalho é detectado automaticamente. ',
        h('br'),
        'Reimportar o mesmo arquivo atualiza as faturas em vez de duplicar.')),
    h('label', { class: 'campo' }, h('span', {}, 'Arquivo CSV'), entrada));

  modal({
    titulo: 'Importar carteira por CSV',
    corpo,
    acoes: [
      { rotulo: 'Cancelar', aoClicar: (fechar) => fechar() },
      {
        rotulo: 'Importar',
        estilo: '',
        aoClicar: async (fechar) => {
          if (!entrada.files?.[0]) {
            toast('Escolha um arquivo .csv.', 'erro');
            return;
          }
          const formData = new FormData();
          formData.append('arquivo', entrada.files[0]);
          try {
            const resultado = await api.enviarArquivo('/api/fontes/importar-csv', formData);
            fechar();
            toast(`${resultado.novos} nova(s) e ${resultado.atualizados} atualizada(s).`
              + (resultado.ignoradas.length ? ` ${resultado.ignoradas.length} linha(s) ignorada(s).` : ''), 'ok');
            aoTerminar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      },
    ],
  });
}

export async function montar(ctx) {
  const raiz = h('div', {});
  const area = h('div', {}, carregando());

  const recarregar = async () => {
    limpar(area).append(carregando());
    const [saude, fontes] = await Promise.all([
      api.get('/api/saude'),
      api.get('/api/fontes'),
    ]);

    // ---- integrações principais ----
    const situacao = (rotulo, config, extra) => h('div', { class: 'indicador' },
      h('div', { class: 'rotulo' }, rotulo),
      h('div', { style: 'margin-top:8px' },
        config ? etiqueta('Configurado', 'ok') : etiqueta('Não configurado', 'neutro')),
      extra ? h('div', { class: 'nota' }, extra) : null);

    const intg = saude?.integracoes || {};
    const integracoes = h('div', { class: 'indicadores' },
      situacao('Bitrix24 CRM', intg.bitrix?.configurado, 'negócios e faturamento'),
      situacao('D4Sign', intg.d4sign?.configurado, 'assinaturas eletrônicas'),
      situacao('NXFácil', intg.nxfacil?.configurado, intg.nxfacil?.modo === 'mock' ? 'modo mock' : 'emissão fiscal'),
      situacao('Sicredi', intg.sicredi?.configurado, 'boletos e cobranças'),
      situacao('Serviço de integração', intg.integracao?.configurado, 'webhooks e espelho'),
      indicador({
        rotulo: 'Fila do espelho',
        valor: saude?.espelho?.pendentes || 0,
        tom: saude?.espelho?.falhados ? 'critico' : ((saude?.espelho?.pendentes || 0) ? 'alerta' : 'ok'),
        nota: `${saude?.espelho?.enviados || 0} enviados · ${saude?.espelho?.falhados || 0} falharam`,
      }));

    // ---- fontes de cobrança ----
    const linhasFontes = h('tbody', {});
    for (const fonte of (fontes?.fontes || [])) {
      const ultima = fonte.ultimaSincronizacao;
      linhasFontes.append(h('tr', {},
        h('td', {}, h('div', { class: 'forte' }, fonte.rotulo),
          h('div', { class: 'silencioso', style: 'font-size:11px' }, fonte.id)),
        h('td', {}, fonte.configurado
          ? etiqueta('Ativo', 'ok')
          : h('div', {}, etiqueta('Inativo', 'neutro'),
            h('div', { class: 'silencioso', style: 'font-size:11px;margin-top:3px' }, fonte.motivoInativo || ''))),
        h('td', { class: 'num' }, fonte.faturas || 0),
        h('td', {}, ultima
          ? h('div', {},
            etiqueta(ultima.estado === 'ok' ? 'ok' : ultima.estado, ultima.estado === 'ok' ? 'ok' : 'critico'),
            h('div', { class: 'silencioso', style: 'font-size:11px;margin-top:3px' }, desdeQuando(ultima.terminado_em)))
          : h('span', { class: 'silencioso' }, 'nunca')),
        h('td', { class: 'silencioso', style: 'font-size:11.5px' },
          ultima?.erro || (ultima ? `${ultima.novos || 0} novas · ${ultima.atualizados || 0} atualizadas` : '—'))));
    }

    // ---- histórico ----
    const linhasHistorico = h('tbody', {});
    for (const execucao of (fontes?.historico || [])) {
      linhasHistorico.append(h('tr', {},
        h('td', {}, execucao.fonte),
        h('td', {}, etiqueta(execucao.estado, execucao.estado === 'ok' ? 'ok' : (execucao.estado === 'erro' ? 'critico' : 'info'))),
        h('td', { class: 'num' }, execucao.registros || 0),
        h('td', { class: 'num' }, execucao.novos || 0),
        h('td', { class: 'num' }, execucao.atualizados || 0),
        h('td', { class: 'silencioso', style: 'font-size:11.5px' }, dataHora(execucao.terminado_em || execucao.iniciado_em)),
        h('td', { class: 'silencioso', style: 'font-size:11.5px;max-width:280px' }, execucao.erro || '—')));
    }

    limpar(area).append(
      integracoes,

      h('div', { class: 'cartao', style: 'margin-bottom:16px' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, 'Fontes de cobrança'),
          h('div', { class: 'acoes' },
            h('button', { class: 'botao secundario', type: 'button', onclick: () => importarCsv(recarregar) },
              icone('baixar'), 'Importar CSV'),
            h('button', {
              class: 'botao', type: 'button',
              onclick: async (evento) => {
                const botao = evento.currentTarget;
                botao.disabled = true;
                try {
                  const resultado = await api.post('/api/sincronizar');
                  const ativas = resultado.cobrancas.fontes.filter((f) => !f.pulado);
                  toast(ativas.length
                    ? `Sincronizado: ${ativas.map((f) => `${f.fonte} (${f.registros ?? 0})`).join(', ')}.`
                    : 'Nenhuma fonte externa configurada — nada a puxar.', 'ok');
                  await recarregar();
                } catch (erro) {
                  toast(erro.message, 'erro');
                } finally {
                  botao.disabled = false;
                }
              },
            }, icone('atualizar'), 'Sincronizar agora'))),
        h('div', { class: 'cartao-corpo sem-espaco' }, h('div', { class: 'tabela-envolve' }, h('table', {},
          h('thead', {}, h('tr', {},
            h('th', {}, 'Fonte'), h('th', {}, 'Situação'), h('th', { class: 'num' }, 'Faturas'),
            h('th', {}, 'Última execução'), h('th', {}, 'Resultado'))),
          linhasFontes)))),

      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, 'Histórico de sincronização'),
          h('span', { class: 'acoes silencioso', style: 'font-size:11.5px' },
            saude.sincronizacaoAutomaticaMinutos
              ? `automática a cada ${saude.sincronizacaoAutomaticaMinutos} min`
              : 'automática desligada')),
        h('div', { class: 'cartao-corpo sem-espaco' },
          fontes.historico.length
            ? h('div', { class: 'tabela-envolve' }, h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Fonte'), h('th', {}, 'Estado'), h('th', { class: 'num' }, 'Registros'),
                h('th', { class: 'num' }, 'Novas'), h('th', { class: 'num' }, 'Atualizadas'),
                h('th', {}, 'Quando'), h('th', {}, 'Erro'))),
              linhasHistorico))
            : vazio('Nenhuma sincronização registrada'))),
    );
  };

  ctx.definirCabecalho({
    titulo: 'Fontes e integrações',
    subtitulo: 'De onde vêm as cobranças e como o espelho para o Bitrix está andando',
    acoes: [h('button', { class: 'botao secundario', type: 'button', onclick: recarregar }, icone('atualizar'), 'Atualizar')],
  });

  raiz.append(area);
  await recarregar();
  return raiz;
}
