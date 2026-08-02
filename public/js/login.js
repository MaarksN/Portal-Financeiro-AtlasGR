// O login precisa do token CSRF antes de postar. Buscamos em
// /api/sessao, que é a única rota que responde sem autenticação — ela
// também diz se o portal está em modo demonstração, para mostrar (ou
// esconder) as credenciais de teste.

const form = document.getElementById('form-login');
const botao = document.getElementById('botao-entrar');
const areaMensagem = document.getElementById('msg-login');
const dicaDemo = document.getElementById('dica-demo');

let csrf = null;

function mensagem(texto, tipo = 'critico') {
  areaMensagem.replaceChildren();
  if (!texto) return;
  const caixa = document.createElement('div');
  caixa.className = `aviso ${tipo}`;
  caixa.style.margin = '14px 0 0';
  caixa.textContent = texto;
  areaMensagem.append(caixa);
}

function mostrarDicaDemo() {
  const contas = [
    ['comercial@atlasgr.com.br', 'solicitante'],
    ['financeiro@atlasgr.com.br', 'cobranças e baixa de pagamento'],
    ['coordenacao@atlasgr.com.br', 'aprova reembolso'],
    ['ti@atlasgr.com.br', 'chamados'],
  ];
  dicaDemo.replaceChildren();
  dicaDemo.append(document.createTextNode('Modo demonstração · senha '));
  const senha = document.createElement('b');
  senha.textContent = 'atlas123';
  dicaDemo.append(senha, document.createTextNode(' para todas as contas'), document.createElement('br'));

  for (const [email, papel] of contas) {
    const forte = document.createElement('b');
    forte.textContent = email;
    dicaDemo.append(forte, document.createTextNode(` — ${papel}`), document.createElement('br'));
  }
}

async function preparar() {
  try {
    const resposta = await fetch('/api/sessao');
    const dados = await resposta.json();
    csrf = dados.csrf;

    // Já logado? Vai direto pra central.
    if (dados.autenticado) {
      window.location.replace('/portal.html');
      return;
    }
    if (dados.modoDemo) mostrarDicaDemo();
  } catch {
    mensagem('Não foi possível falar com o servidor. Recarregue a página.');
  }
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(form));

  botao.disabled = true;
  botao.textContent = 'Entrando…';
  mensagem('');

  try {
    const resposta = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
      body: JSON.stringify(dados),
    });
    const corpo = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      // Token velho (aba aberta há muito tempo): pega um novo e avisa.
      if (corpo.codigo === 'csrf_invalido') {
        await preparar();
        throw new Error('A página estava aberta há muito tempo. Tente entrar de novo.');
      }
      throw new Error(corpo.erro || 'Não foi possível entrar.');
    }

    window.location.href = '/portal.html';
  } catch (erro) {
    mensagem(erro.message);
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

preparar();
