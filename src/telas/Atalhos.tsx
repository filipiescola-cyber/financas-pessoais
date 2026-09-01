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
  criarRecorrencia,
  excluirRecorrencia,
} from '../dados/recorrencias';
import { usarFeriados } from '../dados/usarFeriados';
import {
  CampoInicio,
  CampoPrazo,
  CampoQuando,
  diaEhValido,
  inicioEscolhido,
  terminoEscolhido,
  type ModoDePrazo,
} from '../ui/CampoQuando';
import { formatarBR, hoje } from '../dominio/datas';
import {
  repeticoesRestantes,
  rotuloDoDia,
  valorDaOcorrencia,
  type RegraDoDia,
} from '../dominio/recorrencias';
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
  const lista = recorrencias.data ?? [];

  return (
    <Secao
      titulo="Recorrências"
      acao={
        <button onClick={aoCriar} className={`text-xs text-emerald-400 hover:text-emerald-300 ${ALVO_DE_TOQUE}`}>
          {criando ? 'cancelar' : '+ nova recorrência'}
        </button>
      }
    >
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

/**
 * Cadastro de recorrência fora do onboarding.
 *
 * Antes só existia lá dentro: quem trocasse de emprego ou assinasse um serviço
 * novo depois não tinha como registrar, e a projeção ficava desatualizada sem
 * que houvesse onde consertar.
 */
function FormularioRecorrencia({ aoTerminar }: { aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const invalidarTransacoes = usarInvalidarTransacoes();
  const contas = usarContas();
  const categorias = usarCategorias();

  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<Centavos>(0);
  const [dia, setDia] = useState('');
  const [regra, setRegra] = useState<RegraDoDia>('fixo');
  const [mesInicial, setMesInicial] = useState('');
  const [modoPrazo, setModoPrazo] = useState<ModoDePrazo>('sem');
  const [parcelas, setParcelas] = useState('');
  const [mesFinal, setMesFinal] = useState('');
  const [contaId, setContaId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [passo, setPasso] = useState<'nao' | 'sobe' | 'desce'>('nao');
  const [valorDoPasso, setValorDoPasso] = useState<Centavos>(0);

  const feriados = usarFeriados();
  const disponiveis = (contas.data ?? []).filter((c) => c.tipo !== 'divida');
  const doTipo = (categorias.data ?? []).filter((c) => c.tipo === tipo);
  const diaNumero = Number(dia);

  const diaOk = diaEhValido(diaNumero, regra);
  const terminaEm = terminoEscolhido(modoPrazo, parcelas, mesFinal, diaNumero, regra, feriados);

  const prazoOk = modoPrazo === 'sem' || terminaEm !== null;

  const incremento = passo === 'nao' ? 0 : (passo === 'sobe' ? 1 : -1) * valorDoPasso;

  const valido =
    descricao.trim() !== '' &&
    valor > 0 &&
    diaOk &&
    prazoOk &&
    contaId !== null &&
    (passo === 'nao' || valorDoPasso > 0);

  const criar = useMutation({
    mutationFn: () =>
      criarRecorrencia({
        descricao,
        valorPrevisto: valor,
        incremento,
        categoriaId,
        contaId: contaId!,
        tipo,
        natureza: 'fixa',
        dia: diaNumero,
        regra,
        comecaEm: inicioEscolhido(mesInicial),
        terminaEm,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['recorrencias'] });
      // A projeção lê as recorrências: sem isso o número novo só apareceria
      // depois de recarregar.
      await invalidarTransacoes();
      aoTerminar();
    },
  });

  return (
    <Cartao className="space-y-4 p-4">
      <Campo rotulo="Tipo">
        <div className="flex gap-2">
          <Chip ativo={tipo === 'despesa'} aoClicar={() => setTipo('despesa')}>
            Despesa fixa
          </Chip>
          <Chip ativo={tipo === 'receita'} aoClicar={() => setTipo('receita')}>
            Fonte de renda
          </Chip>
        </div>
      </Campo>

      <Campo rotulo="Descrição">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder={tipo === 'despesa' ? 'Aluguel, internet, plano de saúde…' : 'Salário, pró-labore…'}
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <CampoValor
        valor={valor}
        aoMudar={setValor}
        rotulo={tipo === 'despesa' ? 'Valor mensal' : 'Valor líquido'}
      />
      {tipo === 'receita' && (
        <p className="-mt-2 text-xs leading-relaxed text-slate-500">
          Líquido, nunca bruto: é o que cai na conta. Salário bruto não serve para fluxo de caixa.
          Se você tem MEI, sua renda pessoal é a retirada — pró-labore ou distribuição de lucro —
          e não a venda do negócio.
        </p>
      )}

      <CampoDegrau
        base={valor}
        passo={passo}
        valorDoPasso={valorDoPasso}
        aoMudarPasso={setPasso}
        aoMudarValor={setValorDoPasso}
      />

      <CampoQuando
        rotulo={tipo === 'despesa' ? 'Dia do vencimento' : 'Dia do recebimento'}
        dia={dia}
        regra={regra}
        feriados={feriados}
        aPartirDe={inicioEscolhido(mesInicial)}
        aoMudarDia={setDia}
        aoMudarRegra={setRegra}
      />

      <CampoInicio mes={mesInicial} aoMudar={setMesInicial} />

      <CampoPrazo
        modo={modoPrazo}
        parcelas={parcelas}
        mesFinal={mesFinal}
        terminaEm={terminaEm}
        dia={diaNumero}
        regra={regra}
        feriados={feriados}
        aoMudarModo={setModoPrazo}
        aoMudarParcelas={setParcelas}
        aoMudarMesFinal={setMesFinal}
      />

      <Campo rotulo="Conta">
        <ChipsDeConta
          contas={disponiveis}
          escolhida={contaId}
          aoEscolher={(id) => setContaId(id)}
        />
      </Campo>

      <Campo rotulo="Categoria (opcional)">
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

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      <div className="flex gap-2">
        <Botao aoClicar={() => criar.mutate()} desabilitado={!valido || criar.isPending}>
          {criar.isPending ? 'Salvando…' : 'Salvar recorrência'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}

/**
 * Excluir uma recorrência cadastrada por engano (§5.2).
 *
 * O que sai é a REGRA, não o que ela gerou. Os lançamentos já criados são
 * dinheiro que se moveu de verdade — apagá-los junto reescreveria meses
 * fechados por causa de um erro de cadastro. Eles perdem o vínculo e viram
 * lançamentos comuns, e a tela diz quantos são antes de decidir: quem quiser
 * apagá-los também faz isso na lista, um a um, com a consequência à vista.
 *
 * Arquivar continua sendo o certo para a recorrência que existiu e acabou: ela
 * para de gerar e permanece na história.
 */
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

/**
 * Recorrência que muda de valor todo mês (§5.2).
 *
 * A obra que sobe a cada etapa, a dívida negociada que desce. Antes essas
 * contas só cabiam como "valor varia" — e aí não projetavam nada, justamente
 * elas, que são as que mais mexem com a projeção do §8.
 *
 * Um passo fixo não descreve o mundo inteiro, e não é para isso que ele existe:
 * cobre o caso em que a pessoa SABE o passo. Onde o passo não é conhecido,
 * "valor varia" continua sendo a resposta honesta.
 *
 * A prévia existe porque o passo é fácil de digitar errado e difícil de
 * conferir de cabeça: ver o terceiro e o sexto mês ao lado do primeiro
 * responde na hora se o número é o que a pessoa quis dizer.
 */
function CampoDegrau({
  base,
  passo,
  valorDoPasso,
  aoMudarPasso,
  aoMudarValor,
}: {
  base: Centavos;
  passo: 'nao' | 'sobe' | 'desce';
  valorDoPasso: Centavos;
  aoMudarPasso: (v: 'nao' | 'sobe' | 'desce') => void;
  aoMudarValor: (v: Centavos) => void;
}) {
  const incremento = passo === 'nao' ? 0 : (passo === 'sobe' ? 1 : -1) * valorDoPasso;
  const inicio = '2000-01-01';

  const previa = [0, 1, 2, 5].map((n) => ({
    mes: n + 1,
    valor: valorDaOcorrencia(base, incremento, inicio, `2000-0${n + 1}-01`) ?? 0,
  }));

  return (
    <Campo
      rotulo="O valor muda todo mês?"
      ajuda="Para conta que sobe ou desce de forma conhecida — a parcela de uma obra, uma dívida negociada. O valor entra preenchido e você confere no dia de lançar."
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Chip ativo={passo === 'nao'} aoClicar={() => aoMudarPasso('nao')}>
            Sempre o mesmo
          </Chip>
          <Chip ativo={passo === 'sobe'} aoClicar={() => aoMudarPasso('sobe')}>
            Sobe todo mês
          </Chip>
          <Chip ativo={passo === 'desce'} aoClicar={() => aoMudarPasso('desce')}>
            Desce todo mês
          </Chip>
        </div>

        {passo !== 'nao' && (
          <>
            <CampoValor
              valor={valorDoPasso}
              aoMudar={aoMudarValor}
              rotulo={passo === 'sobe' ? 'Quanto sobe por mês' : 'Quanto desce por mês'}
            />

            {base > 0 && valorDoPasso > 0 && (
              <p className="rounded-md border border-borda-forte px-3 py-2 text-xs leading-relaxed text-slate-400">
                {previa.map((p, i) => (
                  <span key={p.mes}>
                    {i > 0 && ' · '}
                    {p.mes === 6 && '… '}
                    <span className="text-slate-500">{p.mes}º</span>{' '}
                    <span className="numero dinheiro text-slate-300">{formatar(p.valor)}</span>
                  </span>
                ))}
                {previa[3]!.valor === 0 && (
                  <span className="block pt-1 text-slate-500">
                    Chega a zero antes do sexto mês. Se ela acaba, vale usar um prazo abaixo.
                  </span>
                )}
              </p>
            )}
          </>
        )}
      </div>
    </Campo>
  );
}
