import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { usarContas } from '../dados/usarContas';
import { usarCategorias } from '../dados/usarTransacoes';
import { usarCriarModelo, usarExcluirModelo, usarModelos, usarRecorrencias } from '../dados/usarModelos';
import {
  arquivarRecorrencia,
  contarGeradosDaRecorrencia,
  excluirRecorrencia,
} from '../dados/recorrencias';
import { usarFeriados } from '../dados/usarFeriados';

import { formatarBR, hoje } from '../dominio/datas';
import { repeticoesRestantes, rotuloDoDia, valorDaOcorrencia } from '../dominio/recorrencias';
import { FormularioRecorrencia } from '../ui/FormularioDeRecorrencia';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { ALVO_DE_TOQUE, Botao, Campo, Cartao, Chip, Dinheiro, ENTRADA, Nota, Pagina, Secao, Vazio } from '../ui/base';
import { ChipsDeConta } from '../ui/ChipsDeConta';
import { ConfirmacaoDeExclusao } from '../ui/ConfirmacaoDeExclusao';

/**
 * Modelos e recorrências (§5.2).
 *
 * "Juntos, modelos + autocomplete + recorrências eliminam a maior parte da
 * digitação. Sobra só o gasto avulso do dia." O autocomplete não tem tela: ele
 * aprende sozinho a cada lançamento com descrição.
 */
export function Atalhos() {
  const [criando, setCriando] = useState(false);
  const [criandoRecorrencia, setCriandoRecorrencia] = useState(false);

  return (
    <Pagina
      titulo="Atalhos"
      subtitulo="O que elimina digitação repetida"
      acao={
        <Botao
          aoClicar={() => setCriando((v) => !v)}
          tipo={criando ? 'secundario' : 'primario'}
        >
          {criando ? 'Cancelar' : 'Novo modelo'}
        </Botao>
      }
    >
      {criando && <FormularioModelo aoTerminar={() => setCriando(false)} />}
      <ListaDeModelos aoCriar={() => setCriando(true)} />

      {criandoRecorrencia && (
        <FormularioRecorrencia aoTerminar={() => setCriandoRecorrencia(false)} />
      )}
      <ListaDeRecorrencias aoCriar={() => setCriandoRecorrencia((v) => !v)} criando={criandoRecorrencia} />

      <Nota>
        O autocomplete não tem tela: ele aprende sozinho a cada lançamento com descrição, e sugere
        a categoria e a conta da última vez que você usou aquela descrição.
      </Nota>
    </Pagina>
  );
}

function ListaDeModelos({ aoCriar }: { aoCriar: () => void }) {
  const modelos = usarModelos();
  const excluir = usarExcluirModelo();
  const contas = usarContas();
  const categorias = usarCategorias(true);

  const nomeConta = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));
  const nomeCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
  const lista = modelos.data ?? [];

  return (
    <Secao titulo="Modelos">
      {lista.length === 0 ? (
        <Vazio
          titulo="Nenhum modelo ainda"
          descricao="Almoço, Uber, Gasolina: um toque preenche categoria, conta e tipo, e só falta o valor. Eles aparecem como chips no topo da folha de lançamento."
          acao={<Botao aoClicar={aoCriar}>Criar o primeiro</Botao>}
        />
      ) : (
        <Cartao>
          <ul className="divide-y divide-borda">
            {lista.map((modelo) => (
              <li key={modelo.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-slate-100">{modelo.nome}</p>
                  <p className="truncate text-xs text-slate-500">
                    {modelo.tipo === 'receita' ? 'Receita' : 'Despesa'}
                    {modelo.categoriaId && ` · ${nomeCategoria.get(modelo.categoriaId) ?? '—'}`}
                    {modelo.contaId && ` · ${nomeConta.get(modelo.contaId) ?? '—'}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {modelo.valorPadrao !== null ? (
                    <Dinheiro centavos={modelo.valorPadrao} className="text-sm text-slate-300" />
                  ) : (
                    <span className="text-xs text-slate-600">Pergunta o valor</span>
                  )}
                  <button
                    onClick={() => excluir.mutate(modelo.id)}
                    className={`text-xs text-slate-600 transition hover:text-red-400 ${ALVO_DE_TOQUE}`}
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </Secao>
  );
}

function ListaDeRecorrencias({
  aoCriar,
  criando,
}: {
  aoCriar: () => void;
  criando: boolean;
}) {
  const recorrencias = usarRecorrencias();
  const contas = usarContas();
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();

  const [excluindo, setExcluindo] = useState<string | null>(null);

  const arquivar = useMutation({
    mutationFn: arquivarRecorrencia,
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      mostrar('Recorrência arquivada. Os lançamentos já gerados continuam.');
    },
  });

  const nomeConta = new Map((contas.data ?? []).map((c) => [c.id, c.nome]));
  const feriadosDaLista = usarFeriados();

  // Assinatura de cartão é cobrança da FATURA e mora em Faturas, ao lado da
  // fatura em que vai entrar. Aqui ela aparecia solta, e a pessoa cadastrava
  // uma cobrança de cartão sem nunca ver onde ela cai.
  const doCartao = new Set(
    (contas.data ?? []).filter((c) => c.tipo === 'cartao_credito').map((c) => c.id),
  );
  const noCartao = (recorrencias.data ?? []).filter((r) => doCartao.has(r.contaId)).length;
  const lista = (recorrencias.data ?? []).filter((r) => !doCartao.has(r.contaId));

  return (
    <Secao
      titulo="Recorrências"
      acao={
        <button onClick={aoCriar} className={`text-xs text-emerald-400 hover:text-emerald-300 ${ALVO_DE_TOQUE}`}>
          {criando ? 'cancelar' : '+ nova recorrência'}
        </button>
      }
    >
      {noCartao > 0 && (
        <Nota>
          {noCartao === 1 ? 'Uma cobrança recorrente' : `${noCartao} cobranças recorrentes`} no
          cartão {noCartao === 1 ? 'fica' : 'ficam'} em <strong>Faturas</strong>, dentro da fatura
          em que {noCartao === 1 ? 'entra' : 'entram'}.
        </Nota>
      )}

      {lista.length === 0 ? (
        <Vazio
          titulo="Nenhuma recorrência cadastrada"
          descricao="Aluguel, internet, assinaturas e salário. Elas geram o lançamento sozinhas no dia certo — e a fonte de renda fixa é o que faz a projeção funcionar antes de existir histórico."
          acao={<Botao aoClicar={aoCriar}>Cadastrar a primeira</Botao>}
        />
      ) : (
        <>
          <Cartao>
            <ul className="divide-y divide-borda">
              {lista.map((recorrencia) => (
                <li
                  key={recorrencia.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-slate-100">{recorrencia.descricao}</p>
                    <p className="truncate text-xs text-slate-500">
                      {recorrencia.tipo === 'receita' ? 'Entrada' : 'Saída'} ·{' '}
                      {rotuloDoDia(recorrencia.dia, recorrencia.regra)} ·{' '}
                      {nomeConta.get(recorrencia.contaId) ?? '—'}
                      {recorrencia.comecaEm > hoje() && (
                        <> · começa em {formatarBR(recorrencia.comecaEm)}</>
                      )}
                      {/* Gradativa: o valor ao lado é o da BASE, e sem dizer
                          isto ele pareceria o valor de todo mês. */}
                      {recorrencia.incremento !== 0 && (
                        <>
                          {' '}
                          · {recorrencia.incremento > 0 ? 'sobe' : 'desce'}{' '}
                          {formatar(Math.abs(recorrencia.incremento))}/mês
                        </>
                      )}
                      {recorrencia.terminaEm !== null && (
                        <>
                          {' '}
                          · faltam{' '}
                          {repeticoesRestantes(
                            hoje(),
                            recorrencia.terminaEm,
                            recorrencia.dia,
                            recorrencia.regra,
                            feriadosDaLista,
                          )}
                          x
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    {recorrencia.valorPrevisto !== null ? (
                      <Dinheiro
                        centavos={
                          valorDaOcorrencia(
                            recorrencia.valorPrevisto,
                            recorrencia.incremento,
                            recorrencia.comecaEm,
                            hoje(),
                          ) ?? recorrencia.valorPrevisto
                        }
                        className="text-sm text-slate-300"
                      />
                    ) : (
                      <span className="text-xs text-amber-400/80">Valor varia</span>
                    )}
                    <button
                      onClick={() => arquivar.mutate(recorrencia.id)}
                      className={`text-xs text-slate-600 transition hover:text-slate-300 ${ALVO_DE_TOQUE}`}
                    >
                      Arquivar
                    </button>
                    <button
                      onClick={() =>
                        setExcluindo(excluindo === recorrencia.id ? null : recorrencia.id)
                      }
                      title="Para a recorrência cadastrada por engano. Os lançamentos já gerados ficam."
                      className={`text-xs text-slate-600 transition hover:text-red-400 ${ALVO_DE_TOQUE}`}
                    >
                      {excluindo === recorrencia.id ? 'Cancelar' : 'Excluir'}
                    </button>
                  </div>

                  {excluindo === recorrencia.id && (
                    <ExclusaoDeRecorrencia
                      recorrencia={recorrencia}
                      aoTerminar={() => setExcluindo(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Cartao>
          <p className="text-xs leading-relaxed text-slate-600">
            Os lançamentos são gerados na abertura do app, de forma retroativa: ficar dias sem
            abrir não perde nenhum. Recorrência de valor variável entra para revisão, com o valor
            zerado, para você só ajustar o número.
          </p>
        </>
      )}
    </Secao>
  );
}

function FormularioModelo({ aoTerminar }: { aoTerminar: () => void }) {
  const criar = usarCriarModelo();
  const contas = usarContas();
  const categorias = usarCategorias();

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [contaId, setContaId] = useState<string | null>(null);
  const [comValorPadrao, setComValorPadrao] = useState(false);
  const [valorPadrao, setValorPadrao] = useState<Centavos>(0);

  const doTipo = (categorias.data ?? []).filter((c) => c.tipo === tipo);
  const disponiveis = (contas.data ?? []).filter((c) => c.tipo !== 'divida');

  return (
    <Cartao className="space-y-4 p-4">
      <Campo rotulo="Nome" ajuda="É o texto do chip. Curto funciona melhor: Almoço, Uber, Mercado.">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Almoço"
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <Campo rotulo="Tipo">
        <div className="flex gap-2">
          <Chip ativo={tipo === 'despesa'} aoClicar={() => setTipo('despesa')}>
            Despesa
          </Chip>
          <Chip ativo={tipo === 'receita'} aoClicar={() => setTipo('receita')}>
            Receita
          </Chip>
        </div>
      </Campo>

      <Campo rotulo="Categoria">
        <div className="flex flex-wrap gap-2">
          {doTipo.map((categoria) => (
            <Chip
              key={categoria.id}
              ativo={categoriaId === categoria.id}
              aoClicar={() => setCategoriaId(categoriaId === categoria.id ? null : categoria.id)}
            >
              {categoria.nome}
            </Chip>
          ))}
        </div>
      </Campo>

      <Campo rotulo="Conta">
        <ChipsDeConta
          contas={disponiveis}
          escolhida={contaId}
          aoEscolher={(id) => setContaId(contaId === id ? null : id)}
        />
      </Campo>

      <Campo
        rotulo="Valor"
        ajuda="Sem valor padrão o modelo só preenche categoria e conta, e você digita o valor. É o caso mais comum."
      >
        <div className="flex gap-2">
          <Chip ativo={!comValorPadrao} aoClicar={() => setComValorPadrao(false)}>
            Pergunta o valor
          </Chip>
          <Chip ativo={comValorPadrao} aoClicar={() => setComValorPadrao(true)}>
            Valor fixo
          </Chip>
        </div>
      </Campo>

      {comValorPadrao && <CampoValor valor={valorPadrao} aoMudar={setValorPadrao} />}

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao
          desabilitado={nome.trim() === '' || criar.isPending}
          aoClicar={() =>
            criar.mutate(
              {
                nome,
                tipo,
                categoriaId,
                contaId,
                valorPadrao: comValorPadrao ? valorPadrao : null,
              },
              { onSuccess: aoTerminar },
            )
          }
        >
          {criar.isPending ? 'Salvando…' : 'Salvar modelo'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>

      {valorPadrao > 0 && comValorPadrao && (
        <p className="text-xs text-slate-500">
          Um toque no chip já lança {formatar(valorPadrao)}.
        </p>
      )}
    </Cartao>
  );
}
function ExclusaoDeRecorrencia({
  recorrencia,
  aoTerminar,
}: {
  recorrencia: { id: string; descricao: string };
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const invalidarTransacoes = usarInvalidarTransacoes();

  const gerados = useQuery({
    queryKey: ['recorrencia-gerados', recorrencia.id],
    queryFn: () => contarGeradosDaRecorrencia(recorrencia.id),
  });

  const excluir = useMutation({
    mutationFn: () => excluirRecorrencia(recorrencia.id),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      await invalidarTransacoes();
      aoTerminar();
    },
  });

  if (gerados.isPending) {
    return <p className="mt-3 text-xs text-slate-500">Vendo o que ela já gerou…</p>;
  }

  const quantos = gerados.data ?? 0;

  return (
    <ConfirmacaoDeExclusao
      consequencia={
        quantos === 0
          ? 'Esta recorrência nunca gerou lançamento: excluir não deixa rastro.'
          : quantos === 1
            ? 'O lançamento que ela já gerou CONTINUA na lista — ele é dinheiro que se moveu. Só a regra some, e ele vira um lançamento comum.'
            : `Os ${quantos} lançamentos que ela já gerou CONTINUAM na lista — eles são dinheiro que se moveu. Só a regra some, e eles viram lançamentos comuns.`
      }
      ajuda="Para parar de gerar sem apagar o cadastro, use Arquivar. Se algum lançamento gerado também estiver errado, apague-o na lista de Lançamentos."
      emAndamento={excluir.isPending}
      erro={excluir.isError ? (excluir.error as Error).message : null}
      aoConfirmar={() => excluir.mutate()}
      aoCancelar={aoTerminar}
    />
  );
}
