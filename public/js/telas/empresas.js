import { api } from '../nucleo/api.js';
import {
  h, limpar, icone, toast, modal, confirmar, campo, selecao, lerFormulario,
  data, vazio, carregando, etiqueta,
} from '../nucleo/ui.js';

// ------------------------------------------------------------------
// Empresas e filiais — fundação multiempresa/multifilial (Onda 1).
// Só admin enxerga esta tela (ver TELAS em app.js). Lista de empresas
// na raiz; detalhe com filiais em #/empresas/<id>.
// ------------------------------------------------------------------

const REGIMES = [
  { valor: 'simples', rotulo: 'Simples Nacional' },
  { valor: 'lucro_presumido', rotulo: 'Lucro presumido' },
  { valor: 'lucro_real', rotulo: 'Lucro real' },
];

function camposEndereco(endereco = {}) {
  return h('div', { class: 'linha-campos' },
    campo('CEP', h('input', { type: 'text', name: 'endereco.cep', value: endereco?.cep || '', maxlength: '9' })),
    campo('UF', h('input', { type: 'text', name: 'endereco.uf', value: endereco?.uf || '', maxlength: '2' })),
    campo('Logradouro', h('input', { type: 'text', name: 'endereco.logradouro', value: endereco?.logradouro || '' })),
    campo('Número', h('input', { type: 'text', name: 'endereco.numero', value: endereco?.numero || '' })),
    campo('Complemento', h('input', { type: 'text', name: 'endereco.complemento', value: endereco?.complemento || '' })),
    campo('Bairro', h('input', { type: 'text', name: 'endereco.bairro', value: endereco?.bairro || '' })),
    campo('Cidade', h('input', { type: 'text', name: 'endereco.cidade', value: endereco?.cidade || '' })));
}

// O form é plano (name="endereco.cep" etc.); reagrupa em objeto antes
// de mandar pra API, e descarta se tudo vier vazio.
function lerFormularioComEndereco(elemento) {
  const dados = lerFormulario(elemento);
  const endereco = {};
  for (const chave of Object.keys(dados)) {
    if (!chave.startsWith('endereco.')) continue;
    const campoEndereco = chave.slice('endereco.'.length);
    if (dados[chave] !== null) endereco[campoEndereco] = dados[chave];
    delete dados[chave];
  }
  dados.endereco = Object.keys(endereco).length ? endereco : null;
  if (dados.principal !== undefined) dados.principal = dados.principal === 'on' || dados.principal === true;
  return dados;
}

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
        h('td', {}, h('div', { class: 'forte' }, empresa.nome),
          empresa.razaoSocial ? h('div', { class: 'silencioso', style: 'font-size:11px' }, empresa.razaoSocial) : null),
        h('td', {}, empresa.cnpj || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, REGIMES.find((r) => r.valor === empresa.regimeTributario)?.rotulo || empresa.regimeTributario),
        h('td', { class: 'num' }, `${empresa.filiaisAtivas}/${empresa.filiaisTotal}`),
        h('td', {}, empresa.ativa ? etiqueta('ativa', 'ok') : etiqueta('inativa', 'neutro'))));
    }

    limpar(areaTabela).append(h('div', { class: 'tabela-envolve' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Empresa'), h('th', {}, 'CNPJ'), h('th', {}, 'Regime tributário'),
        h('th', { class: 'num' }, 'Filiais ativas'), h('th', {}, 'Situação'))),
      corpo)));
  };

  const novaEmpresa = () => {
    const form = h('form', {},
      campo('Nome', h('input', { type: 'text', name: 'nome', maxlength: '150', required: true })),
      campo('Razão social', h('input', { type: 'text', name: 'razaoSocial', maxlength: '200' })),
      h('div', { class: 'linha-campos' },
        campo('CNPJ', h('input', { type: 'text', name: 'cnpj', maxlength: '18', placeholder: '00.000.000/0000-00' })),
        campo('Regime tributário', selecao('regimeTributario', REGIMES, 'simples'))),
      h('div', { class: 'linha-campos' },
        campo('Inscrição estadual', h('input', { type: 'text', name: 'inscricaoEstadual', maxlength: '30' })),
        campo('Inscrição municipal', h('input', { type: 'text', name: 'inscricaoMunicipal', maxlength: '30' }))),
      h('div', { class: 'linha-campos' },
        campo('Telefone', h('input', { type: 'text', name: 'telefone', maxlength: '30' })),
        campo('E-mail', h('input', { type: 'email', name: 'email', maxlength: '150' }))),
      campo('Site', h('input', { type: 'text', name: 'site', maxlength: '200' })),
      camposEndereco());

    modal({
      titulo: 'Nova empresa',
      largo: true,
      corpo: form,
      acoes: [{
        rotulo: 'Cadastrar',
        estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            await api.post('/api/empresas', lerFormularioComEndereco(form));
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
    subtitulo: 'Cadastro de empresas e filiais — base para operação multiempresa',
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
      campo('CNPJ', h('input', { type: 'text', name: 'cnpj', maxlength: '18', value: filial?.cnpj || '' })),
      h('div', { class: 'linha-campos' },
        campo('Inscrição estadual', h('input', { type: 'text', name: 'inscricaoEstadual', maxlength: '30', value: filial?.inscricaoEstadual || '' })),
        campo('Inscrição municipal', h('input', { type: 'text', name: 'inscricaoMunicipal', maxlength: '30', value: filial?.inscricaoMunicipal || '' }))),
      h('div', { class: 'linha-campos' },
        campo('Telefone', h('input', { type: 'text', name: 'telefone', maxlength: '30', value: filial?.telefone || '' })),
        campo('E-mail', h('input', { type: 'email', name: 'email', maxlength: '150', value: filial?.email || '' }))),
      camposEndereco(filial?.endereco),
      h('label', { class: 'campo', style: 'flex-direction:row;align-items:center;gap:8px' },
        h('input', { type: 'checkbox', name: 'principal', checked: filial?.principal || false }),
        h('span', {}, 'Filial principal (matriz)')));

    modal({
      titulo: filial ? `Editar ${filial.nome}` : 'Nova filial',
      largo: true,
      corpo: form,
      acoes: [{
        rotulo: filial ? 'Salvar' : 'Cadastrar',
        estilo: 'sucesso',
        aoClicar: async (fechar) => {
          try {
            const dados = lerFormularioComEndereco(form);
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
      titulo: empresa.nome,
      subtitulo: empresa.razaoSocial || '',
      acoes: [
        h('button', { class: 'botao secundario', type: 'button', onclick: () => ctx.irPara('empresas') },
          icone('volta'), 'Voltar'),
        h('button', {
          class: `botao ${empresa.ativa ? 'perigo' : 'sucesso'}`,
          type: 'button',
          onclick: async () => {
            const ok = await confirmar({
              titulo: empresa.ativa ? 'Desativar empresa' : 'Ativar empresa',
              texto: empresa.ativa
                ? `"${empresa.nome}" ficará indisponível para novos lançamentos até ser reativada.`
                : `"${empresa.nome}" voltará a ficar disponível.`,
              confirmar: empresa.ativa ? 'Desativar' : 'Ativar',
              estilo: empresa.ativa ? 'perigo' : 'sucesso',
            });
            if (!ok) return;
            try {
              await api.post(`/api/empresas/${id}/${empresa.ativa ? 'desativar' : 'ativar'}`);
              toast(empresa.ativa ? 'Empresa desativada.' : 'Empresa ativada.', 'ok');
              recarregar();
            } catch (erro) {
              toast(erro.message, 'erro');
            }
          },
        }, empresa.ativa ? 'Desativar' : 'Ativar'),
      ],
    });

    const corpoFiliais = h('tbody', {});
    for (const filial of empresa.filiais) {
      corpoFiliais.append(h('tr', {},
        h('td', {}, h('div', { class: 'forte' }, filial.nome), filial.principal ? etiqueta('matriz', 'info') : null),
        h('td', {}, filial.cnpj || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, filial.telefone || h('span', { class: 'silencioso' }, '—')),
        h('td', {}, filial.ativa ? etiqueta('ativa', 'ok') : etiqueta('inativa', 'neutro')),
        h('td', {}, h('div', { style: 'display:flex;gap:5px;justify-content:flex-end' },
          h('button', {
            class: 'botao secundario pequeno', type: 'button',
            onclick: () => abrirFormularioFilial(id, filial, recarregar),
          }, 'Editar'),
          h('button', {
            class: `botao ${filial.ativa ? 'perigo' : 'sucesso'} pequeno`,
            type: 'button',
            disabled: filial.principal && filial.ativa,
            title: filial.principal && filial.ativa ? 'A filial principal não pode ser desativada' : '',
            onclick: async () => {
              const ok = await confirmar({
                titulo: filial.ativa ? 'Desativar filial' : 'Ativar filial',
                texto: `"${filial.nome}"`,
                confirmar: filial.ativa ? 'Desativar' : 'Ativar',
                estilo: filial.ativa ? 'perigo' : 'sucesso',
              });
              if (!ok) return;
              try {
                await api.post(`/api/empresas/${id}/filiais/${filial.id}/${filial.ativa ? 'desativar' : 'ativar'}`);
                toast(filial.ativa ? 'Filial desativada.' : 'Filial ativada.', 'ok');
                recarregar();
              } catch (erro) {
                toast(erro.message, 'erro');
              }
            },
          }, filial.ativa ? 'Desativar' : 'Ativar')))));
    }

    limpar(areaCorpo).append(
      h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' },
        h('div', { class: 'linha-campos' },
          campo('CNPJ', h('div', {}, empresa.cnpj || '—')),
          campo('Regime tributário', h('div', {}, REGIMES.find((r) => r.valor === empresa.regimeTributario)?.rotulo)),
          campo('Inscrição estadual', h('div', {}, empresa.inscricaoEstadual || '—')),
          campo('Inscrição municipal', h('div', {}, empresa.inscricaoMunicipal || '—')),
          campo('Telefone', h('div', {}, empresa.telefone || '—')),
          campo('E-mail', h('div', {}, empresa.email || '—')),
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
              h('th', {}, 'Filial'), h('th', {}, 'CNPJ'), h('th', {}, 'Telefone'),
              h('th', {}, 'Situação'), h('th', {}, ''))),
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
