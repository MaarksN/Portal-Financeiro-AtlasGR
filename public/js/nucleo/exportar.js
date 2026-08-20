// Utilitário de exportação de dados em CSV.
// Gera download direto no navegador sem depender do servidor.

import { h, icone, toast } from './ui.js';

/**
 * Dispara o download de um arquivo CSV a partir de dados em memória.
 * @param {string} nomeArquivo - Nome do arquivo sem extensão.
 * @param {string[]} cabecalhos - Lista de nomes de colunas.
 * @param {Array<Array<string|number>>} linhas - Dados por linha.
 */
export function exportarCSV(nomeArquivo, cabecalhos, linhas) {
  const separador = ';';
  const bom = '\uFEFF'; // BOM para Excel reconhecer UTF-8

  function escapar(valor) {
    const texto = String(valor ?? '');
    if (texto.includes(separador) || texto.includes('"') || texto.includes('\n')) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  }

  const conteudo = [
    cabecalhos.map(escapar).join(separador),
    ...linhas.map((linha) => linha.map(escapar).join(separador)),
  ].join('\r\n');

  const blob = new Blob([bom + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const agora = new Date().toISOString().slice(0, 10);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${nomeArquivo}-${agora}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast('Arquivo CSV exportado.', 'ok');
}

/**
 * Cria um botão de salvar/exportar para usar na barra de ações do cabeçalho.
 * @param {string} nomeArquivo - Nome base do arquivo (sem extensão e sem data).
 * @param {() => { cabecalhos: string[], linhas: Array<Array<string|number>> }} obterDados
 *   Função que retorna os dados no momento do clique.
 * @returns {HTMLElement} Botão pronto para inserir no DOM.
 */
export function botaoSalvar(nomeArquivo, obterDados) {
  return h('button', {
    class: 'botao secundario', type: 'button',
    onclick: () => {
      try {
        const { cabecalhos, linhas } = obterDados();
        if (!linhas || !linhas.length) {
          toast('Nenhum dado para exportar.', 'alerta');
          return;
        }
        exportarCSV(nomeArquivo, cabecalhos, linhas);
      } catch (erro) {
        toast(erro.message, 'erro');
      }
    },
  }, icone('baixar', 14), ' Salvar CSV');
}
