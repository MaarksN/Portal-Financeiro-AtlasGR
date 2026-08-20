import { describe, it, expect } from 'vitest';
import bitrixExtrator from '../lib/bitrixExtrator';
import { consultar, consultarUm, executar } from '../db';

describe('Módulo de Extração e Sincronização Bitrix24', () => {
  it('deve exportar categorias padrão da AtlasGR incluindo categoria 20 (Financeiro)', async () => {
    const categorias = bitrixExtrator.CATEGORIAS_PADRAO;
    expect(categorias).toBeInstanceOf(Array);
    const cat20 = categorias.find((c) => c.id === '20');
    expect(cat20).toBeDefined();
    expect(cat20.nome).toContain('Financeiro');
  });

  it('deve conter estágios mapeados do funil financeiro (20)', async () => {
    const estagios = bitrixExtrator.ESTAGIOS_FINANCEIRO['20'];
    expect(estagios).toBeInstanceOf(Array);
    const estagioWon = estagios.find((e) => e.code === 'C20:WON');
    expect(estagioWon).toBeDefined();
    expect(estagioWon.label).toBe('Contrato Assinado');
  });

  it('deve importar deals extraídos para contratos_deals e cobrancas com valores em centavos', () => {
    const dealMock = {
      dealId: '999901',
      titulo: 'Contrato Teste Empresa ABC',
      estagioId: 'C20:WON',
      categoriaId: '20',
      valorReais: 5500.50,
      valorCentavos: 550050,
      moeda: 'BRL',
      empresaId: '1001',
      empresaNome: 'Empresa ABC Transportes',
      contatoId: '2001',
      contatoNome: 'João Silva',
      contatoEmail: 'joao@empresaabc.com.br',
      documento: '12.345.678/0001-99',
      diaVencimento: '15',
      plano: 'Anual Pro',
      dataCriacao: '2026-08-01 10:00:00',
      dataFechamento: '2026-08-20',
      dataContratoAssinado: '2026-08-15',
      statusContrato: 'assinado',
      isGanho: true,
      isAberto: false,
      isPerdido: false,
    };

    const resultado = bitrixExtrator.importarParaFinanceiro([dealMock]);
    expect(resultado.total).toBe(1);

    const dealSalvo = consultarUm('SELECT * FROM contratos_deals WHERE deal_id = ?', '999901');
    expect(dealSalvo).toBeDefined();
    expect(dealSalvo.valor_centavos).toBe(550050);
    expect(dealSalvo.cliente_nome).toBe('Empresa ABC Transportes');
    expect(dealSalvo.cliente_email).toBe('joao@empresaabc.com.br');

    const cobrancaSalva = consultarUm('SELECT * FROM cobrancas WHERE id_externo = ?', 'DEAL-999901');
    expect(cobrancaSalva).toBeDefined();
    expect(cobrancaSalva.valor_centavos).toBe(550050);
    expect(cobrancaSalva.cliente_nome).toBe('Empresa ABC Transportes');

    // Limpeza do teste
    executar('DELETE FROM cobrancas WHERE id_externo = ?', 'DEAL-999901');
    executar('DELETE FROM contratos_deals WHERE deal_id = ?', '999901');
  });
});
