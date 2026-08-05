import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, confirmar, campo, lerFormulario,
  vazio, carregando, etiqueta,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Empresas e filiais. Lista de empresas na raiz; detalhe com filiais
// em #/empresas/<id>. Schema simples (cnpj, razão social, nome
// fantasia, ativo) — sem endereço/regime tributário/inscrições, que
// não existem na tabela.
// ------------------------------------------------------------------

// ------------------------------- Lista -------------------------------
async function montarLista(ctx) {
  const raiz = h('div', {});
  const areaTabela = h('div', { class: 'cartao-corpo sem-espaco' }, carregando());

  const recarregar = async () => {
    const lista = await api.get('/api/empresas');

    if (!lista.length) {
      limpar(areaTabela).append(vazio('Nenhuma empresa cadastrada', 'Cadastre a primeira empresa para começar.'));
      return;
    }

    const corpo = h('tbody', {});
    for (const empresa of lista) {
      corpo.append(h('tr', { class: 'clicavel', onclick: () => ctx.irPara(`empresas/${empresa.id}`) },
        h('td', {}, h('div', { class: 'forte' }, empresa.razaoSocial),
          empresa.nomeFantasia ? h('div', { class: 'silencioso', style: 'font-size:11px' }, empresa.nomeFantasia) : null),
        h('td', {}, empresa.cnpj || h('span', { class: 'silencioso' }, '—')),
        h('td', { class: 'num' }, `${empresa.filiaisAtivas}/${empresa.filiaisTotal}`),
        h('td', {}, empresa.ativo ? etiqueta('ativa', 'ok') : etiqueta('inativa', 'neutro'))));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Empresa'), h('th', {}, 'CNPJ'),
        h('th', { class: 'num' }, 'Filiais ativas'), h('th', {}, 'Situação'))),
      corpo)));
  };

  const novaEmpresa = () => {
    const form = h('form', {},
      campo('Razão social', h('input', { type: 'text', name: 'razaoSocial', maxlength: '200', required: true })),
      campo('Nome fantasia', h('input', { type: 'text', name: 'nomeFantasia', maxlength: '150' })),
      campo('CNPJ', h('input', { type: 'text', name: 'cnpj', maxlength: '18', required: true, placeholder: '00.000.000/0000-00' })));

    modal({
      titulo: 'Nova empresa',
      corpo: form,
      acoes: [{
        rotulo: 'Cadastrar',
        estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            await api.post('/api/empresas', lerFormulario(form));
            fechar();
            toast('Empresa cadastrada.', 'ok');
            recarregar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }],
    });
  };

  ctx.definirCabecalho({
    titulo: 'Empresas',
    subtitulo: 'Cadastro de empresas e filiais',
    acoes: [h('button', { class: 'botao primario', type: 'button', onclick: novaEmpresa }, icone('mais'), 'Nova empresa')],
  });

  raiz.append(h('div', { class: 'cartao' },
    h('div', { class: 'cartao-cabeca' }, h('h3', {}, 'Empresas cadastradas')), areaTabela));

  await recarregar();
  return raiz;
}

// ------------------------------ Detalhe ------------------------------
async function montarDetalhe(ctx, id) {
  const raiz = h('div', {});
  const areaCorpo = h('div', {}, carregando());
  raiz.append(areaCorpo);

  const abrirFormularioFilial = (empresaId, filial, aoSalvar) => {
    const form = h('form', {},
      campo('Nome', h('input', { type: 'text', name: 'nome', maxlength: '150', required: true, value: filial?.nome || '' })),
      campo('CNPJ', h('input', { type: 'text', name: 'cnpj', maxlength: '18', required: true, value: filial?.cnpj || '' })));

    modal({
      titulo: filial ? `Editar ${filial.nome}` : 'Nova filial',
      corpo: form,
      acoes: [{
        rotulo: filial ? 'Salvar' : 'Cadastrar',
        estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            const dados = lerFormulario(form);
            if (filial) await api.patch(`/api/empresas/${empresaId}/filiais/${filial.id}`, dados);
            else await api.post(`/api/empresas/${empresaId}/filiais`, dados);
            fechar();
            toast(filial ? 'Filial atualizada.' : 'Filial cadastrada.', 'ok');
            aoSalvar();
          } catch (erro) {
            toast(erro.message, 'erro');
          }
        },
      }],
    });
  };

  const recarregar = async () => {
    let empresa;
    try {
      empresa = await api.get(`/api/empresas/${id}`);
    } catch (erro) {
      limpar(areaCorpo).append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
        h('div', { class: 'aviso critico' }, icone('alerta', 16), h('div', {}, erro.message)))));
      return;
    }

    ctx.definirCabecalho({
      titulo: empresa.razaoSocial,
      subtitulo: empresa.nomeFantasia || '',
      acoes: [
        h('button', { class: 'botao secundario', type: 'button', onclick: () => ctx.irPara('empresas') },
          icone('volta'), 'Voltar'),
        h('button', {
          class: `botao ${empresa.ativo ? 'perigo' : 'sucesso'}`,
          type: 'button',
          onclick: async () => {
            const ok = await confirmar({
              titulo: empresa.ativo ? 'Desativar empresa' : 'Ativar empresa',
              texto: empresa.ativo
                ? `"${empresa.razaoSocial}" ficará indisponível para novos lançamentos até ser reativada.`
                : `"${empresa.razaoSocial}" voltará a ficar disponível.`,
              confirmar: empresa.ativo ? 'Desativar' : 'Ativar',
              estilo: empresa.ativo ? 'perigo' : 'sucesso',
            });
            if (!ok) return;
            try {
              await api.post(`/api/empresas/${id}/${empresa.ativo ? 'desativar' : 'ativar'}`);
              toast(empresa.ativo ? 'Empresa desativada.' : 'Empresa ativada.', 'ok');
              recarregar();
            } catch (erro) {
              toast(erro.message, 'erro');
            }
          },
        }, empresa.ativo ? 'Desativar' : 'Ativar'),
      ],
    });

    const corpoFiliais = h('tbody', {});
    for (const filial of empresa.filiais) {
      corpoFiliais.append(h('tr', {},
        h('td', {}, h('div', { class: 'forte' }, filial.nome)),
        h('td', {}, filial.cnpj || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, filial.ativo ? etiqueta('ativa', 'ok') : etiqueta('inativa', 'neutro')),
        h('td', {}, h('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
          h('button', {
            class: 'botao secundario pequeno', type: 'button',
            onclick: () => abrirFormularioFilial(id, filial, recarregar),
          }, 'Editar'),
          h('button', {
            class: `botao ${filial.ativo ? 'perigo' : 'sucesso'} pequeno`,
            type: 'button',
            onclick: async () => {
              const ok = await confirmar({
                titulo: filial.ativo ? 'Desativar filial' : 'Ativar filial',
                texto: `"${filial.nome}"`,
                confirmar: filial.ativo ? 'Desativar' : 'Ativar',
                estilo: filial.ativo ? 'perigo' : 'sucesso',
              });
              if (!ok) return;
              try {
                await api.post(`/api/empresas/${id}/filiais/${filial.id}/${filial.ativo ? 'desativar' : 'ativar'}`);
                toast(filial.ativo ? 'Filial desativada.' : 'Filial ativada.', 'ok');
                recarregar();
              } catch (erro) {
                toast(erro.message, 'erro');
              }
            },
          }, filial.ativo ? 'Desativar' : 'Ativar')))));
    }

    limpar(areaCorpo).append(
      h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
        h('div', { class: 'linha-campos' },
          campo('CNPJ', h('div', {}, empresa.cnpj || '—')),
          campo('Nome fantasia', h('div', {}, empresa.nomeFantasia || '—')),
        ))),
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-cabeca' },
          h('h3', {}, 'Filiais'),
          h('button', {
            class: 'botao secundario pequeno', type: 'button',
            onclick: () => abrirFormularioFilial(id, null, recarregar),
          }, icone('mais'), 'Nova filial')),
        empresa.filiais.length
          ? h('div', { class: 'cartao-corpo sem-espaco' }, h('div', { class: 'tabela-envolve' }, h('table', {},
            h('thead', {}, h('tr', {},
              h('th', {}, 'Filial'), h('th', {}, 'CNPJ'), h('th', {}, 'Situação'), h('th', {}, ''))),
            corpoFiliais)))
          : h('div', { class: 'cartao-corpo' }, vazio('Nenhuma filial', 'Cadastre a primeira filial desta empresa.'))),
    );
  };

  await recarregar();
  return raiz;
}

export async function montar(ctx) {
  return ctx.parametro ? montarDetalhe(ctx, Number(ctx.parametro)) : montarLista(ctx);
}
