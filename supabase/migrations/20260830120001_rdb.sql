-- RDB como tipo de investimento (§7.1).
--
-- Recibo de Depósito Bancário: o equivalente ao CDB emitido por financeira e
-- por banco digital, quase sempre indexado ao CDI e muitas vezes com liquidez
-- diária. Não é isento de IR — segue a mesma tabela regressiva do CDB.
--
-- Ficava fora da lista, então quem tinha um cadastrava como "Outro" e perdia o
-- rótulo no agrupamento da carteira.

alter table investimentos drop constraint investimentos_tipo_check;

alter table investimentos
  add constraint investimentos_tipo_check check (tipo in (
    'cdb', 'rdb', 'tesouro', 'lci', 'lca', 'poupanca',
    'fundo', 'acoes', 'cripto', 'outro'));

comment on column investimentos.liquidez_diaria is
  'Resgatável a qualquer momento. Só o que tem liquidez diária conta como '
  'reserva de emergência (§8.8): dinheiro travado até o vencimento não é reserva.';
