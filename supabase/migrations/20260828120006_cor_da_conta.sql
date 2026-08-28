-- Cor da conta (§4).
--
-- Vem da instituição: escolher "Nubank" no cadastro traz o roxo junto. É o que
-- faz a conta ser reconhecida antes de lida — na lista de contas e, sobretudo,
-- nos chips da folha de lançamento, onde duas contas do mesmo banco (a conta e
-- o cartão) aparecem lado a lado com o mesmo nome.
--
-- A cor fica na conta, não numa tabela de instituições: instituição aqui é só
-- um rótulo com uma cor sugerida, e uma tabela para isso seria uma junção a
-- mais em toda leitura de conta para guardar sete caracteres.

alter table contas
  add column cor text;

comment on column contas.cor is
  'Cor da conta em hexadecimal (#RRGGBB). Sugerida pela instituição no cadastro '
  'e editável. Null usa o cinza padrão da tela.';
