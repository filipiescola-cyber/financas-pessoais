-- Ícone das categorias padrão (§4.3).
--
-- A coluna `categorias.icone` existe desde o primeiro schema e nunca foi
-- preenchida. O que é gravado é a CHAVE do desenho, não o desenho: o SVG mora
-- no front (src/ui/iconesDeCategoria.tsx), então trocar o traço de um ícone
-- amanhã não exige tocar em dado nenhum, e uma chave que deixe de existir vira
-- uma categoria sem ícone — nunca uma tela quebrada.
--
-- Só preenche o que está vazio: quem já escolheu um ícone não tem a escolha
-- sobrescrita por uma migration.

update categorias set icone = case nome
  when 'Alimentação'           then 'talheres'
  when 'Mercado'               then 'carrinho'
  when 'Transporte'            then 'carro'
  when 'Moradia'               then 'casa'
  when 'Contas'                then 'lampada'
  when 'Saúde'                 then 'coracao'
  when 'Educação'              then 'escola'
  when 'Lazer'                 then 'controle'
  when 'Assinaturas'           then 'filme'
  when 'Vestuário'             then 'camiseta'
  when 'Cuidados pessoais'     then 'tesoura'
  when 'Pets'                  then 'pata'
  when 'Presentes'             then 'presente'
  when 'Impostos e taxas'      then 'documento'
  when 'Investimentos'         then 'grafico'
  when 'Ajuste de saldo'       then 'ferramenta'
  when 'Salário'               then 'carteira'
  when 'Pró-labore'            then 'maleta'
  when 'Distribuição de lucro' then 'percentual'
  when 'Rendimentos'           then 'grafico'
  when 'Venda de bem pessoal'  then 'etiqueta'
  when 'Reembolso'             then 'devolver'
  when 'Restituição de IR'     then 'recibo'
  when 'Outros'                then 'circulo'
end
where icone is null;

comment on column categorias.icone is
  'Chave do desenho no banco de ícones do front, não o SVG. Chave desconhecida '
  'é tratada como sem ícone (§4.3).';
