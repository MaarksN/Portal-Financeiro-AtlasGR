// Camada de acesso à API. Um lugar só para o token CSRF, o tratamento
// de sessão expirada e o formato de erro que o back-end devolve.

let csrf = null;
let sessaoAtual = null;

export class ErroApi extends Error {
  constructor(mensagem, { status, codigo, detalhes } = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

async function bruto(caminho, { metodo = 'GET', corpo, formData } = {}) {
  const opcoes = { method: metodo, headers: {} };

  if (csrf && metodo !== 'GET') opcoes.headers['X-CSRF-Token'] = csrf;

  if (formData) {
    opcoes.body = formData;           // o browser cuida do boundary
  } else if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }

  const resposta = await fetch(caminho, opcoes);

  // Sessão caiu no meio do uso: volta pro login sem deixar a tela
  // meio carregada.
  if (resposta.status === 401 && !caminho.endsWith('/api/sessao')) {
    window.location.href = '/login.html';
    throw new ErroApi('Sessão expirada.', { status: 401, codigo: 'sessao_expirada' });
  }

  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('application/json') ? await resposta.json() : await resposta.text();

  if (!resposta.ok) {
    throw new ErroApi(
      (dados && dados.erro) || `Falha na requisição (${resposta.status})`,
      { status: resposta.status, codigo: dados?.codigo, detalhes: dados?.detalhes },
    );
  }

  return dados;
}

export const api = {
  get: (caminho) => bruto(caminho),
  post: (caminho, corpo) => bruto(caminho, { metodo: 'POST', corpo }),
  patch: (caminho, corpo) => bruto(caminho, { metodo: 'PATCH', corpo }),
  remover: (caminho) => bruto(caminho, { metodo: 'DELETE' }),
  enviarArquivo: (caminho, formData) => bruto(caminho, { metodo: 'POST', formData }),
};

// Monta a query string ignorando filtros vazios.
export function comQuery(caminho, parametros = {}) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor === undefined || valor === null || valor === '' || valor === false) continue;
    busca.set(chave, valor === true ? '1' : String(valor));
  }
  const texto = busca.toString();
  return texto ? `${caminho}?${texto}` : caminho;
}

export async function carregarSessao() {
  sessaoAtual = await bruto('/api/sessao');
  csrf = sessaoAtual.csrf;
  return sessaoAtual;
}

export const sessao = () => sessaoAtual;

export async function sair() {
  await api.post('/logout');
  window.location.href = '/login.html';
}
