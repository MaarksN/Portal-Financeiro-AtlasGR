# PROMPT MESTRE — IMPLEMENTAÇÃO COMPLETA DO ERP NA PLATAFORMA

## 1. MISSÃO DO AGENTE

Você é o agente principal de arquitetura, engenharia, produto, UX, dados, segurança e qualidade responsável por transformar a plataforma atual em um **ERP empresarial completo**, integrado ao ecossistema comercial, financeiro, fiscal e operacional da empresa.

Implemente integralmente todos os módulos descritos neste documento.

Não crie:

- Telas estáticas sem funcionamento.
- Botões sem ação.
- Dados falsos permanentes.
- Formulários que não salvam.
- Relatórios sem conexão com o banco.
- Gráficos com números aleatórios.
- Integrações simuladas apresentadas como concluídas.
- Menus que apontem para páginas inexistentes.
- Funcionalidades marcadas como “em breve” sem necessidade técnica real.

Cada módulo deverá possuir:

- Interface completa.
- Backend funcional.
- Rotas protegidas.
- Banco de dados.
- Validações.
- Logs de auditoria.
- Permissões por usuário.
- Filtros.
- Busca.
- Paginação.
- Importação e exportação.
- Histórico de alterações.
- Tratamento de erros.
- Testes.
- Documentação técnica.
- Estados de carregamento, vazio, sucesso e erro.
- Integração com os demais módulos.

A plataforma deverá utilizar a identidade visual própria da AtlasGR. A estrutura funcional poderá servir como referência de mercado, mas não deverá copiar marcas, logotipos, textos proprietários ou identidade visual de terceiros.

---

# 2. NAVEGAÇÃO PRINCIPAL

Criar um menu lateral responsivo, recolhível e pesquisável contendo:

1. Início
2. Favoritos
3. Importações
4. Frente de caixa
5. Produtos
6. Serviços
7. Compras
8. Financeiro
9. Antecipações
10. Estoque
11. Relatórios
12. Integrações
13. Configurações
14. Administração
15. Auditoria
16. Central de notificações
17. Assistente de IA

Permitir ao usuário:

- Favoritar qualquer página.
- Reordenar favoritos.
- Fixar relatórios.
- Pesquisar módulos e funções.
- Acessar itens recentes.
- Visualizar atalhos conforme o perfil de acesso.
- Ocultar módulos sem permissão.
- Criar atalhos personalizados no painel inicial.

---

# 3. INÍCIO — COCKPIT EXECUTIVO

Criar uma página inicial configurável com visão consolidada da empresa.

## Indicadores

- Receita do mês.
- Despesas do mês.
- Resultado financeiro.
- Saldo disponível.
- Contas a receber.
- Contas a pagar.
- Valores vencidos.
- Inadimplência.
- Fluxo de caixa projetado.
- Vendas realizadas.
- Ticket médio.
- Margem bruta.
- Lucro bruto.
- Produtos com estoque crítico.
- Pedidos pendentes.
- Notas fiscais pendentes.
- Contratos próximos do vencimento.
- Clientes sem compra recente.
- Metas comerciais.
- Previsão de fechamento.
- Alertas fiscais e financeiros.

## Personalização

Permitir:

- Adicionar e remover widgets.
- Alterar posição e tamanho dos cards.
- Salvar diferentes painéis.
- Criar painéis por departamento.
- Filtrar por empresa, filial, período, vendedor e centro de custo.
- Compartilhar painéis com outros usuários.
- Exportar o painel para PDF, imagem e planilha.

---

# 4. FAVORITOS

Criar uma central de favoritos para:

- Páginas.
- Clientes.
- Fornecedores.
- Produtos.
- Serviços.
- Relatórios.
- Vendas.
- Compras.
- Contratos.
- Contas financeiras.
- Centros de custo.

Permitir agrupamento em pastas, ordenação manual, pesquisa e compartilhamento.

---

# 5. IMPORTAÇÕES

Criar um motor completo de importação por:

- CSV.
- XLS.
- XLSX.
- XML.
- JSON.
- OFX.
- CNAB.
- API.
- Arquivos fiscais.

## Entidades importáveis

- Clientes.
- Fornecedores.
- Produtos.
- Serviços.
- Transportadoras.
- Contas a pagar.
- Contas a receber.
- Vendas.
- Compras.
- Movimentações financeiras.
- Movimentações de estoque.
- Notas fiscais.
- Categorias.
- Centros de custo.
- Tabelas de preços.

## Recursos obrigatórios

- Mapeamento visual de colunas.
- Modelos reutilizáveis.
- Validação antes da importação.
- Detecção de duplicidades.
- Atualização ou criação de registros.
- Pré-visualização.
- Relatório de erros.
- Possibilidade de desfazer importação.
- Histórico completo.
- Processamento em lote.
- Log por linha importada.

---

# 6. FRENTE DE CAIXA

## 6.1 Frente de caixa

Implementar um PDV completo com:

- Abertura e fechamento de caixa.
- Identificação do operador.
- Seleção do cliente.
- Leitura de código de barras.
- Busca de produtos.
- Inclusão de serviços.
- Descontos com controle de permissão.
- Acréscimos.
- Múltiplas formas de pagamento.
- Pagamento dividido.
- Dinheiro, cartão, PIX, boleto e crediário.
- Cálculo de troco.
- Impressão de comprovante.
- Emissão fiscal.
- Cancelamento.
- Devolução.
- Sangria.
- Suprimento.
- Venda em espera.
- Recuperação de venda.
- Funcionamento responsivo.
- Compatibilidade com impressora térmica.

## 6.2 Movimentação do caixa

Exibir:

- Aberturas.
- Fechamentos.
- Entradas.
- Saídas.
- Sangrias.
- Suprimentos.
- Divergências.
- Saldo esperado.
- Saldo informado.
- Operador responsável.
- Histórico de alterações.

## 6.3 Vendas por vendedor no PDV

Apresentar:

- Quantidade de vendas.
- Valor bruto.
- Valor líquido.
- Descontos.
- Ticket médio.
- Comissão.
- Produtos vendidos.
- Margem.
- Cancelamentos.
- Comparação por período.

## 6.4 Notas fiscais de consumidor

Implementar:

- Emissão.
- Consulta.
- Cancelamento.
- Reimpressão.
- Envio por e-mail.
- Envio por WhatsApp.
- Download de XML e DANFE.
- Controle de contingência.
- Situação na SEFAZ.
- Histórico de eventos.

## 6.5 Menu fiscal

Incluir:

- Configuração tributária.
- Séries fiscais.
- Certificado digital.
- CSC.
- Ambiente de homologação e produção.
- Regras fiscais por produto.
- Regras fiscais por filial.
- Logs de transmissão.
- Gestão de rejeições.

## 6.6 Configuração do frente de caixa

Configurar:

- Filial.
- Caixa.
- Operadores.
- Formas de pagamento.
- Impressoras.
- Limites de desconto.
- Emissão fiscal.
- Estoque utilizado.
- Conta financeira.
- Categorias padrão.
- Regras de comissão.

---

# 7. PRODUTOS

## 7.1 Orçamentos

Criar gestão de orçamentos com:

- Número automático.
- Cliente.
- Vendedor.
- Produtos.
- Quantidades.
- Valores.
- Descontos.
- Frete.
- Validade.
- Condições de pagamento.
- Observações.
- Aprovação digital.
- Conversão em venda.
- Histórico de versões.
- Envio por e-mail e WhatsApp.
- Geração de PDF.
- Situações personalizadas.

## 7.2 Vendas de produtos

Implementar:

- Pedido de venda.
- Separação.
- Faturamento.
- Expedição.
- Entrega.
- Cancelamento.
- Devolução.
- Troca.
- Reserva de estoque.
- Baixa automática.
- Comissão.
- Rastreamento.
- Integração financeira.
- Integração fiscal.
- Integração com transportadora.

## 7.3 Contratos de produtos

Permitir:

- Contratos recorrentes.
- Vigência.
- Renovação automática.
- Reajustes.
- Produtos contratados.
- Quantidades.
- Parcelamento.
- Cobrança recorrente.
- Alertas de vencimento.
- Suspensão.
- Cancelamento.
- Aditivos.
- Assinatura eletrônica.

## 7.4 Parcelas a receber

Exibir:

- Cliente.
- Venda vinculada.
- Vencimento.
- Valor.
- Situação.
- Forma de pagamento.
- Conta bancária.
- Cobranças enviadas.
- Juros.
- Multas.
- Descontos.
- Histórico de recebimento.

## 7.5 Notas fiscais de produto

Implementar emissão e gestão de NF-e com:

- XML.
- DANFE.
- Carta de correção.
- Cancelamento.
- Inutilização.
- Devolução.
- Nota complementar.
- Reenvio.
- Consulta na SEFAZ.
- Regras tributárias.
- Histórico de eventos.

## 7.6 Consulta de crédito

Criar estrutura para integração autorizada com fornecedores de análise de crédito.

Exibir:

- Resultado da consulta.
- Score.
- Restrições.
- Data.
- Provedor.
- Usuário responsável.
- Consentimento e base legal.
- Histórico de consultas.

## 7.7 Cadastros de produtos

### Clientes

- Dados pessoais ou empresariais.
- Contatos.
- Endereços.
- Documentos.
- Limite de crédito.
- Condições de pagamento.
- Vendedores responsáveis.
- Histórico comercial.
- Histórico financeiro.
- Consentimentos.
- Anexos.
- Campos personalizados.

### Produtos

- Nome.
- SKU.
- Código de barras.
- Descrição.
- Categoria.
- Marca.
- Unidade.
- Custo.
- Preço.
- Margem.
- Estoque mínimo e máximo.
- NCM.
- CEST.
- Origem.
- Tributação.
- Imagens.
- Variações.
- Lotes.
- Validade.
- Fornecedores.
- Dimensões e peso.

### Transportadoras

- Dados cadastrais.
- Contatos.
- Endereços.
- Modalidades.
- Tabelas de frete.
- Regiões atendidas.
- Prazos.
- Documentos.
- Integrações.

## 7.8 Configurações de produtos

- Configuração de notas fiscais.
- Modelo de e-mail de venda.
- Séries fiscais.
- Tabelas de preço.
- Comissões.
- Políticas de desconto.
- Regras de reserva.
- Regras de estoque negativo.

---

# 8. SERVIÇOS

## 8.1 Orçamentos de serviços

Possuir os mesmos recursos dos orçamentos de produtos, incluindo:

- Horas estimadas.
- Profissionais envolvidos.
- Materiais.
- Custos adicionais.
- Cronograma.
- Escopo.
- Aprovação.
- Conversão em venda ou ordem de serviço.

## 8.2 Vendas de serviços

Implementar:

- Venda avulsa.
- Venda recorrente.
- Cobrança por hora.
- Cobrança por projeto.
- Cobrança por etapa.
- Comissão.
- Retenções.
- Emissão de nota.
- Integração financeira.

## 8.3 Contratos de serviços

Permitir:

- Planos recorrentes.
- Escopo contratado.
- SLA.
- Franquia de horas.
- Renovação.
- Reajuste.
- Cobrança automática.
- Aditivos.
- Assinatura eletrônica.
- Suspensão e cancelamento.

## 8.4 Ordens de serviço

Criar:

- Número automático.
- Cliente.
- Local de atendimento.
- Responsável.
- Equipe.
- Serviço.
- Prioridade.
- Prazo.
- Checklist.
- Fotos.
- Anexos.
- Materiais utilizados.
- Horas trabalhadas.
- Assinatura do cliente.
- Geolocalização autorizada.
- Situação.
- Histórico.
- Conversão em cobrança.

## 8.5 Parcelas a receber de serviços

Integrar com contratos, vendas, ordens de serviço e financeiro.

## 8.6 Notas fiscais de serviço

Implementar:

- Emissão de NFS-e.
- Integração municipal.
- Retenções.
- ISS.
- Cancelamento.
- Substituição.
- Download.
- Envio.
- Consulta de situação.
- Histórico.

## 8.7 Cadastros de serviços

- Clientes.
- Serviços.
- Transportadoras.
- Técnicos.
- Equipes.
- Tabelas de preço.
- Tipos de atendimento.
- SLAs.

## 8.8 Configurações de serviços

- Configuração fiscal.
- Modelos de e-mail.
- Séries fiscais.
- Regras de cobrança.
- Retenções.
- Comissões.
- Aprovações.
- SLAs.

---

# 9. COMPRAS

## 9.1 Compras

Criar fluxo completo:

1. Solicitação de compra.
2. Aprovação.
3. Cotação.
4. Comparação de fornecedores.
5. Pedido de compra.
6. Recebimento.
7. Conferência.
8. Entrada em estoque.
9. Geração financeira.
10. Vinculação da nota fiscal.

## 9.2 Notas fiscais de compra

### Notas de produto — NF-e

- Importação de XML.
- Manifestação.
- Conferência dos itens.
- Vinculação com pedido.
- Entrada em estoque.
- Geração de contas a pagar.
- Tratamento de divergências.
- Cadastro automático assistido.

### Notas de serviço — NFS-e

- Importação.
- Retenções.
- Vinculação ao fornecedor.
- Vinculação a centro de custo.
- Geração financeira.
- Aprovação.

### Notas de importação

- Declaração de importação.
- Despesas aduaneiras.
- Tributos.
- Frete.
- Seguro.
- Rateio de custos.
- Custo final do produto.
- Entrada em estoque.

## 9.3 Parcelas a pagar

Implementar:

- Fornecedor.
- Compra.
- Documento.
- Vencimento.
- Valor.
- Categoria.
- Centro de custo.
- Conta.
- Aprovação.
- Baixa.
- Juros.
- Multas.
- Descontos.
- Anexos.
- Histórico.

## 9.4 Cadastros de compras

- Fornecedores.
- Produtos.
- Serviços.
- Transportadoras.
- Condições de pagamento.
- Compradores.
- Aprovadores.

---

# 10. FINANCEIRO

## 10.1 Extrato da Conta PJ

Exibir:

- Saldo.
- Entradas.
- Saídas.
- Transferências.
- Tarifas.
- Rendimentos.
- Conciliação.
- Identificação da origem.
- Documentos vinculados.
- Atualização via integração bancária.

## 10.2 Outras contas

Permitir cadastrar:

- Conta corrente.
- Conta poupança.
- Carteira.
- Caixa.
- Aplicação.
- Conta de pagamento.
- Conta digital.
- Conta de recebimento.
- Conta por filial.

## 10.3 Visão de competência

Apresentar receitas e despesas com base na competência, independentemente da data de pagamento ou recebimento.

## 10.4 Contas a pagar

Recursos:

- Lançamento manual.
- Recorrência.
- Parcelamento.
- Rateio.
- Aprovação.
- Agendamento.
- Baixa.
- Anexos.
- Código de barras.
- PIX.
- Conciliação.
- Alertas.
- Renegociação.
- Histórico.

## 10.5 DDA

Criar integração para:

- Consultar boletos emitidos contra a empresa.
- Vincular boletos a fornecedores.
- Aprovar pagamentos.
- Detectar duplicidade.
- Agendar pagamento.
- Conciliar baixa.

## 10.6 Contas a receber

Recursos:

- Cobrança.
- Boleto.
- PIX.
- Link de pagamento.
- Recorrência.
- Parcelamento.
- Régua de cobrança.
- Baixa.
- Conciliação.
- Renegociação.
- Juros.
- Multas.
- Descontos.
- Comunicação automática.

## 10.7 Inadimplentes

Exibir:

- Cliente.
- Valor vencido.
- Quantidade de parcelas.
- Dias em atraso.
- Histórico de contato.
- Promessas de pagamento.
- Risco.
- Responsável.
- Próxima ação.

Implementar régua automática por e-mail, WhatsApp e notificações internas, respeitando consentimento, políticas de uso e legislação aplicável.

## 10.8 Extrato de movimentações

Criar extrato unificado com filtros por:

- Conta.
- Período.
- Categoria.
- Centro de custo.
- Cliente.
- Fornecedor.
- Projeto.
- Situação.
- Origem.
- Usuário.

## 10.9 Fluxo de caixa

Implementar:

- Fluxo diário.
- Fluxo semanal.
- Fluxo mensal.
- Realizado.
- Projetado.
- Cenários.
- Comparação.
- Saldo acumulado.
- Alertas de caixa negativo.
- Previsão por inteligência artificial.

## 10.10 Histórico financeiro

Registrar:

- Criação.
- Alteração.
- Aprovação.
- Cancelamento.
- Baixa.
- Estorno.
- Conciliação.
- Exclusão lógica.
- Usuário.
- Data.
- IP.
- Origem.

## 10.11 Cadastros financeiros

### Conta PJ e cobrança

- Dados bancários.
- Chaves PIX.
- Convênios.
- Carteiras.
- Juros.
- Multas.
- Mensagens de cobrança.
- Certificados.
- Integrações.

### Categorias financeiras

- Receitas.
- Despesas.
- Subcategorias.
- Natureza.
- Vinculação contábil.
- Regras automáticas.

### Centros de custo

- Estrutura hierárquica.
- Responsável.
- Orçamento.
- Limites.
- Projetos.
- Departamentos.
- Rateios.

---

# 11. ANTECIPAÇÕES

Criar módulo para gestão de antecipação de recebíveis:

- Recebíveis elegíveis.
- Taxas.
- Valor bruto.
- Valor líquido.
- Prazo.
- Instituição.
- Solicitação.
- Aprovação.
- Liquidação.
- Histórico.
- Comparação de propostas.
- Simulação.
- Conciliação financeira.

Não apresentar uma integração como ativa quando depender de contrato ou credencial externa.

---

# 12. ESTOQUE

## 12.1 Situação de estoque

Exibir:

- Estoque atual.
- Estoque disponível.
- Estoque reservado.
- Estoque em trânsito.
- Estoque mínimo.
- Estoque máximo.
- Custo médio.
- Valor total.
- Dias de cobertura.
- Giro.
- Ruptura.
- Excesso.

## 12.2 Movimentações manuais

Permitir:

- Entrada.
- Saída.
- Ajuste.
- Perda.
- Avaria.
- Transferência.
- Inventário.
- Produção.
- Consumo interno.
- Doação.
- Devolução.

Exigir motivo, usuário e registro de auditoria.

## 12.3 Inventários

Criar:

- Inventário total.
- Inventário parcial.
- Contagem cega.
- Contagem por endereço.
- Importação por coletor.
- Recontagem.
- Divergências.
- Aprovação.
- Ajuste automático autorizado.
- Relatório final.

## 12.4 Cadastros de estoque

### Produtos

Integrados ao cadastro central.

### Tabelas de preços

- Preço padrão.
- Atacado.
- Varejo.
- Promocional.
- Por cliente.
- Por região.
- Por canal.
- Vigência.
- Quantidade mínima.

### Marcas

- Nome.
- Descrição.
- Imagem.
- Produtos relacionados.

### Unidades de medida

- Unidade.
- Caixa.
- Pacote.
- Quilograma.
- Litro.
- Metro.
- Conversões.

### Categorias de produtos

- Estrutura hierárquica.
- Regras fiscais.
- Regras comerciais.
- Comissões.

### Locais de estoque

- Filial.
- Depósito.
- Corredor.
- Prateleira.
- Posição.
- Capacidade.
- Responsável.

## 12.5 Configuração de estoque

- Permitir ou bloquear estoque negativo.
- Método de custo.
- Reserva automática.
- Baixa automática.
- Validade.
- Lotes.
- Números de série.
- Estoque por filial.
- Transferências.
- Aprovações.

---

# 13. CENTRAL DE RELATÓRIOS

Criar um construtor de relatórios configurável com:

- Filtros avançados.
- Colunas configuráveis.
- Agrupamentos.
- Ordenação.
- Campos calculados.
- Gráficos.
- Tabelas dinâmicas.
- Comparação entre períodos.
- Salvamento de modelos.
- Compartilhamento.
- Controle de acesso.
- Agendamento por e-mail.
- Exportação em PDF, CSV e XLSX.
- API de consulta.
- Atualização em tempo real quando tecnicamente possível.

---

# 14. RELATÓRIOS DE DRE

## Relatórios obrigatórios

- DRE com análise vertical e horizontal.
- DRE gerencial.
- DRE por centros de custo.

## Funcionalidades

- Comparação entre períodos.
- Receitas.
- Custos.
- Despesas.
- Resultado operacional.
- Resultado líquido.
- Percentuais verticais.
- Evolução horizontal.
- Drill-down até o lançamento original.
- Regime de competência.
- Filtros por filial e centro de custo.

---

# 15. RELATÓRIOS DE FLUXO DE CAIXA

Implementar:

- Fluxo de caixa diário.
- Fluxo de caixa mensal.
- Fluxo de caixa mensal personalizado.
- Gráfico de fluxo de caixa mensal.
- Fluxo de caixa diário detalhado.
- Gráfico de fluxo de caixa diário.

Permitir alternar entre:

- Realizado.
- Previsto.
- Realizado versus previsto.
- Cenário otimista.
- Cenário provável.
- Cenário pessimista.

---

# 16. VISÃO DE CAIXA

Implementar:

- Análise de resultados por mês na visão de caixa.
- Análise vertical e horizontal na visão de caixa.
- Análise por centro de custo na visão de caixa.

A visão deverá considerar efetivamente o dinheiro recebido e pago.

---

# 17. RELATÓRIOS DE ANÁLISE FINANCEIRA

Criar todos os relatórios abaixo:

1. Análise de pagamentos.
2. Análise de recebimentos.
3. Análise de inadimplentes.
4. Análise por categorias.
5. Análise por centros de custo.
6. Gráfico de despesas por categoria.
7. Gráfico de receitas e despesas por vencimento.
8. Gráfico de receitas por categoria.
9. Gráfico de saldo mensal por centro de custo.
10. Posição de contas por cliente e fornecedor.
11. Relação de contas a receber e pagar.
12. Relação de lançamentos no caixa.
13. Relação de lançamentos por categorias e centros de custo.
14. Relação detalhada de recebimentos e pagamentos.
15. Situação financeira por vendedores.

Todo relatório deverá permitir abrir o registro de origem.

---

# 18. RELATÓRIOS DE VENDAS

Criar:

1. Análise das vendas por cliente.
2. Análise do custo da mercadoria vendida.
3. Clientes sem vendas há mais tempo.
4. Gráfico de lucro bruto e margem por mês.
5. Gráfico de maiores clientes.
6. Relatório de impostos.
7. Relação de clientes.
8. Relação detalhada das vendas.
9. Relação detalhada de produtos vendidos.
10. Relação detalhada de serviços prestados.
11. Situação de custo, margem e lucro por mês.
12. Situação dos contratos.
13. Situação dos orçamentos.
14. Situação financeira por cliente e serviço.
15. Total de vendas por mês.
16. Análise das vendas por vendedor.

## Métricas adicionais

- Conversão de orçamento.
- Ticket médio.
- Recorrência.
- Churn.
- Receita por vendedor.
- Receita por produto.
- Margem por produto.
- Margem por cliente.
- Tempo médio de fechamento.
- Previsão de vendas.

---

# 19. RELATÓRIOS DE COMPRAS

Criar:

1. Compras por categoria financeira e produto.
2. Gráfico de compras por mês.
3. Relação detalhada das compras.
4. Relação detalhada dos produtos comprados.

Adicionar:

- Evolução de preço.
- Prazo médio de entrega.
- Fornecedores com atraso.
- Divergências de recebimento.
- Economia obtida em cotações.
- Concentração por fornecedor.
- Histórico de custo.

---

# 20. RELATÓRIOS DE ESTOQUE

Criar:

1. Giro de estoque.
2. Posição de estoque.
3. Curva ABC.
4. Giro detalhado de estoque.
5. Posição detalhada de estoque.
6. Histórico de movimentações.

## Indicadores adicionais

- Cobertura em dias.
- Produtos sem movimentação.
- Estoque obsoleto.
- Estoque abaixo do mínimo.
- Estoque acima do máximo.
- Risco de ruptura.
- Valor imobilizado.
- Perdas e avarias.
- Acuracidade do inventário.
- Sugestão de reposição.

---

# 21. INTEGRAÇÕES

Criar uma central para integrações com:

- Bancos.
- Open Finance.
- PIX.
- Boletos.
- Gateways de pagamento.
- SEFAZ.
- Prefeituras.
- Certificados digitais.
- Transportadoras.
- Plataformas de assinatura eletrônica.
- Marketplaces.
- E-commerce.
- WhatsApp.
- E-mail.
- Bitrix24.
- APIs próprias.
- Webhooks.
- Ferramentas de BI.
- Contabilidade.
- CRM.
- Provedores de análise de crédito.

## Recursos da central

- Credenciais criptografadas.
- Teste de conexão.
- Ativação e desativação.
- Logs.
- Tentativas automáticas.
- Fila de processamento.
- Alertas.
- Webhooks recebidos e enviados.
- Controle de escopos.
- Mapeamento de campos.
- Sincronização manual e automática.
- Histórico de sincronização.

---

# 22. ASSISTENTE DE INTELIGÊNCIA ARTIFICIAL

Criar uma IA integrada aos módulos para:

- Resumir resultados.
- Explicar relatórios.
- Detectar anomalias.
- Identificar despesas incomuns.
- Prever falta de caixa.
- Prever inadimplência.
- Prever ruptura de estoque.
- Sugerir compras.
- Sugerir cobranças.
- Gerar relatórios executivos.
- Consultar dados por linguagem natural.
- Criar gráficos.
- Criar filtros.
- Explicar variações.
- Encontrar registros.
- Orientar o usuário na utilização do sistema.

A IA deverá:

- Respeitar as permissões do usuário.
- Não acessar registros não autorizados.
- Indicar as fontes internas usadas.
- Não inventar números.
- Informar quando não houver dados suficientes.
- Registrar ações sensíveis.
- Solicitar confirmação antes de alterações financeiras ou fiscais.

---

# 23. USUÁRIOS, PAPÉIS E PERMISSÕES

Criar controle de acesso por:

- Empresa.
- Filial.
- Departamento.
- Centro de custo.
- Módulo.
- Página.
- Ação.
- Campo.
- Valor financeiro.
- Tipo de documento.

## Papéis iniciais

- Administrador geral.
- Diretor.
- Gestor financeiro.
- Analista financeiro.
- Gestor comercial.
- Vendedor.
- Comprador.
- Estoquista.
- Operador de caixa.
- Fiscal.
- Contador.
- Auditor.
- Técnico de serviços.
- Usuário somente leitura.

Permitir criar papéis personalizados.

---

# 24. APROVAÇÕES E AUTOMAÇÕES

Criar um motor de workflow para:

- Aprovação de compras.
- Aprovação de pagamentos.
- Aprovação de descontos.
- Aprovação de cancelamentos.
- Aprovação de ajustes de estoque.
- Aprovação de antecipações.
- Aprovação de crédito.
- Aprovação de contratos.
- Aprovação de notas.
- Aprovação de estornos.

Permitir regras por:

- Valor.
- Categoria.
- Centro de custo.
- Usuário.
- Departamento.
- Cliente.
- Fornecedor.
- Tipo de operação.
- Filial.

---

# 25. NOTIFICAÇÕES

Criar notificações por:

- Central interna.
- E-mail.
- WhatsApp autorizado.
- Push.
- Webhook.

## Alertas obrigatórios

- Conta próxima do vencimento.
- Conta vencida.
- Cliente inadimplente.
- Caixa projetado negativo.
- Estoque abaixo do mínimo.
- Contrato próximo do vencimento.
- Nota fiscal rejeitada.
- Integração com erro.
- Compra aguardando aprovação.
- Pagamento aguardando aprovação.
- Divergência de caixa.
- Divergência de inventário.
- Certificado próximo do vencimento.

---

# 26. ARQUITETURA TÉCNICA

Antes de implementar, audite a arquitetura atual e preserve tecnologias válidas.

Adotar:

- Arquitetura modular.
- Separação entre domínio, aplicação, infraestrutura e interface.
- APIs documentadas.
- Banco relacional.
- Migrações versionadas.
- Filas para processos demorados.
- Cache quando necessário.
- Processamento assíncrono.
- Observabilidade.
- Logs estruturados.
- Métricas.
- Rastreamento de erros.
- Controle transacional.
- Idempotência.
- Exclusão lógica.
- Backup.
- Recuperação.
- Criptografia.
- Segregação entre empresas.

A aplicação deverá estar preparada para operação multiempresa e multifilial.

---

# 27. MODELO DE DADOS CENTRAL

Criar entidades relacionadas para:

- Empresas.
- Filiais.
- Usuários.
- Papéis.
- Permissões.
- Clientes.
- Fornecedores.
- Transportadoras.
- Produtos.
- Serviços.
- Categorias.
- Marcas.
- Unidades.
- Estoques.
- Locais de estoque.
- Movimentações.
- Inventários.
- Orçamentos.
- Vendas.
- Itens de venda.
- Contratos.
- Ordens de serviço.
- Compras.
- Pedidos de compra.
- Notas fiscais.
- Contas financeiras.
- Contas a pagar.
- Contas a receber.
- Pagamentos.
- Recebimentos.
- Conciliações.
- Categorias financeiras.
- Centros de custo.
- Projetos.
- Caixas.
- Operadores.
- Sessões de caixa.
- Relatórios.
- Favoritos.
- Importações.
- Integrações.
- Webhooks.
- Aprovações.
- Notificações.
- Anexos.
- Comentários.
- Logs de auditoria.

Evitar duplicação desnecessária de cadastros entre módulos.

---

# 28. EXPERIÊNCIA DO USUÁRIO

A interface deverá possuir:

- Design premium.
- Tema claro e escuro.
- Responsividade.
- Acessibilidade.
- Atalhos de teclado.
- Filtros persistentes.
- Busca global.
- Tabelas configuráveis.
- Edição rápida.
- Ações em lote.
- Confirmações para ações críticas.
- Tooltips.
- Ajuda contextual interna.
- Breadcrumbs.
- Navegação consistente.
- Formulários divididos em etapas quando necessário.
- Salvamento automático seguro.
- Prevenção contra perda de dados.
- Mensagens de erro compreensíveis.

---

# 29. SEGURANÇA E CONFORMIDADE

Implementar:

- Autenticação segura.
- Autenticação multifator.
- Sessões controladas.
- RBAC.
- Criptografia em trânsito e repouso.
- Proteção contra ataques comuns.
- Rate limiting.
- Auditoria imutável para ações críticas.
- Gestão de consentimento.
- Retenção de dados.
- Exportação de dados.
- Anonimização.
- Exclusão conforme regras legais.
- Segregação de dados.
- Logs de acesso.
- Rotação de segredos.
- Gestão segura de certificados.
- Conformidade com a LGPD.

---

# 30. TESTES OBRIGATÓRIOS

Criar:

- Testes unitários.
- Testes de integração.
- Testes de API.
- Testes de banco.
- Testes de permissões.
- Testes de cálculos financeiros.
- Testes de estoque.
- Testes fiscais.
- Testes de importação.
- Testes de conciliação.
- Testes de interface.
- Testes end-to-end.
- Testes de segurança.
- Testes de carga.

Nenhuma funcionalidade crítica deverá ser considerada concluída sem testes.

---

# 31. ORDEM DE IMPLEMENTAÇÃO

Executar em ondas:

## Onda 1 — Fundação

- Arquitetura.
- Banco de dados.
- Autenticação.
- Empresas e filiais.
- Usuários e permissões.
- Auditoria.
- Cadastros centrais.
- Design system.

## Onda 2 — Financeiro

- Contas.
- Contas a pagar.
- Contas a receber.
- Categorias.
- Centros de custo.
- Fluxo de caixa.
- Conciliação.
- Inadimplência.

## Onda 3 — Vendas

- Clientes.
- Produtos.
- Serviços.
- Orçamentos.
- Vendas.
- Contratos.
- Parcelas.
- Comissões.

## Onda 4 — Compras e estoque

- Fornecedores.
- Solicitações.
- Cotações.
- Pedidos.
- Recebimentos.
- Estoques.
- Inventários.
- Transferências.

## Onda 5 — Fiscal e PDV

- Frente de caixa.
- NFC-e.
- NF-e.
- NFS-e.
- Configurações fiscais.
- Certificados.
- Integrações governamentais.

## Onda 6 — Relatórios e IA

- DRE.
- Fluxo de caixa.
- Relatórios financeiros.
- Relatórios de vendas.
- Relatórios de compras.
- Relatórios de estoque.
- Construtor de relatórios.
- Inteligência artificial.

## Onda 7 — Integrações e otimização

- Bancos.
- PIX.
- Boletos.
- Bitrix24.
- WhatsApp.
- E-commerce.
- Transportadoras.
- Contabilidade.
- Monitoramento.
- Performance.

---

# 32. CRITÉRIOS DE ACEITE

Um módulo somente poderá ser marcado como concluído quando:

1. Possuir interface funcional.
2. Salvar dados reais.
3. Consultar dados reais.
4. Editar e excluir conforme permissão.
5. Possuir validação.
6. Possuir auditoria.
7. Possuir tratamento de erro.
8. Possuir estado vazio.
9. Possuir carregamento.
10. Possuir filtros e pesquisa.
11. Possuir testes.
12. Possuir documentação.
13. Estar integrado aos módulos relacionados.
14. Respeitar empresa, filial e permissões.
15. Não apresentar dados simulados como verdadeiros.
16. Não possuir botões sem função.
17. Não possuir rotas quebradas.
18. Passar no build, lint, typecheck e testes automatizados.

---

# 33. ENTREGÁVEIS OBRIGATÓRIOS

Ao final de cada onda, entregar:

- Código implementado.
- Migrações de banco.
- Documentação das APIs.
- Diagrama de arquitetura.
- Diagrama do banco.
- Relatório do que foi concluído.
- Lista de pendências reais.
- Evidências de testes.
- Capturas das telas.
- Instruções de execução.
- Variáveis de ambiente documentadas.
- Plano de rollback.
- Registro das decisões técnicas.
- Dados de teste controlados.
- Checklist de aceite preenchido.

---

# 34. REGRA FINAL DE EXECUÇÃO

Não reduza o escopo silenciosamente.

Caso algum recurso dependa de credencial, licença, certificado, convênio bancário, autorização fiscal ou contrato com fornecedor externo:

1. Implemente toda a estrutura interna.
2. Crie a interface de configuração.
3. Crie adaptadores e contratos de integração.
4. Implemente ambiente simulado claramente identificado.
5. Documente exatamente o que falta.
6. Não declare a integração como ativa.
7. Continue executando os demais itens independentes.

O resultado final deverá ser uma plataforma empresarial integrada, segura, auditável e escalável, cobrindo vendas, serviços, compras, financeiro, fiscal, estoque, relatórios, automações e inteligência artificial de ponta a ponta.
