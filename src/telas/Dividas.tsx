import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarBR, hoje, somarMeses, type DataISO } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import {
  parcelaPrice,
  tabelaDeAmortizacao,
  vencimentoDaParcela,
  taxaAnualDeMensal,
  taxaImplicita,
  taxaMensalDeAnual,
  type SistemaDeAmortizacao,
} from '../dominio/divida';
import {
  amortizarDivida,
  desfazerParcela,
  excluirAmortizacao,
  listarAmortizacoes,
  criarDivida,
  pagarParcela,
  excluirDivida,
  listarDividas,
  quitarDivida,
  type DividaCalculada,
} from '../dados/dividas';
import { usarContas } from '../dados/usarContas';
import { usarCategorias } from '../dados/usarTransacoes';
import { podePagarFatura } from '../dominio/saldo';
import { usarAcaoDaPagina } from '../ui/AcaoDaPagina';
import { usarAviso } from '../ui/Aviso';
import { CampoInstituicao } from '../ui/CampoInstituicao';
import { CampoValor } from '../ui/CampoValor';
import { ConfirmacaoDeExclusao } from '../ui/ConfirmacaoDeExclusao';
import {
  ALVO_DE_TOQUE,
  Botao,
  Campo,
  Cartao,
  CartaoIndicador,
  Chip,
  Dinheiro,
  ENTRADA,
  Pagina,
  Secao,
  Vazio,
} from '../ui/base';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function mesCurto(data: DataISO): string {
  return `${MESES[Number(data.slice(5, 7)) - 1]}/${data.slice(0, 4)}`;
}

function porcentagem(decimal: number, casas = 2): string {
  return `${(decimal * 100).toFixed(casas).replace('.', ',')}%`;
}

/**
 * Dívidas: financiamentos e empréstimos (§4.7).
 *
 * O número que ninguém sabe de cabeça é o mês da quitação, e é ele que a tela
 * põe na frente. O segundo é o saldo devedor de verdade — que no Price não é
 * "metade do prazo, metade da dívida": com 6 de 12 parcelas pagas ainda se deve
 * mais da metade, porque o começo é quase todo juros.
 *
 * A ordem é por TAXA, nunca por valor. Atacar a dívida maior antes da mais cara
 * é a decisão errada que parece certa, e a ordenação da tela impede isso sem
 * precisar de sermão.
 */
export function Dividas() {
  const [criando, setCriando] = useState(false);

  usarAcaoDaPagina('Nova dívida', () => setCriando(true));

  const dividas = useQuery({ queryKey: ['dividas'], queryFn: () => listarDividas() });

  const lista = dividas.data ?? [];
  const totalDevido = lista.reduce((soma, d) => soma + d.resumo.saldoDevedor, 0);
  const jurosAPagar = lista.reduce((soma, d) => soma + d.resumo.jurosAindaAPagar, 0);
  const mensal = lista.reduce((soma, d) => soma + (d.resumo.proxima?.valor ?? 0), 0);

  return (
    <Pagina
      titulo="Dívidas"
      subtitulo="O que falta pagar, e até quando"
      acao={
        <Botao aoClicar={() => setCriando((v) => !v)} tipo={criando ? 'secundario' : 'primario'}>
          {criando ? 'Cancelar' : 'Nova dívida'}
        </Botao>
      }
    >
      {criando && <FormularioDeDivida aoTerminar={() => setCriando(false)} />}

      {dividas.isPending ? (
        <p className="text-slate-400">Carregando…</p>
      ) : lista.length === 0 ? (
        !criando && (
          <Vazio
            titulo="Nenhuma dívida cadastrada"
            descricao="Financiamento de imóvel ou carro, empréstimo, crediário fora do cartão. O app calcula o saldo devedor de verdade — com juros — e diz em que mês acaba."
            acao={<Botao aoClicar={() => setCriando(true)}>Cadastrar a primeira</Botao>}
          />
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <CartaoIndicador
              rotulo="Saldo devedor"
              valor={formatar(totalDevido)}
              sotaque="ambar"
              detalhe="O que falta de principal, já descontado o que foi amortizado."
            />
            <CartaoIndicador
              rotulo="Juros ainda a pagar"
              valor={formatar(jurosAPagar)}
              sotaque="neutro"
              tamanho="medio"
              detalhe="O custo do dinheiro daqui até a última parcela."
            />
            <CartaoIndicador
              rotulo="Compromisso do mês"
              valor={formatar(mensal)}
              sotaque="azul"
              tamanho="medio"
              detalhe="Soma das próximas parcelas."
            />
          </div>

          <Secao titulo="Da mais cara para a mais barata">
            <div className="space-y-2">
              {lista.map((item) => (
                <LinhaDeDivida key={item.divida.id} item={item} />
              ))}
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              A ordem é por taxa, nunca por valor: quitar antes a dívida maior em vez da mais cara é
              a decisão errada que parece certa.
            </p>
          </Secao>
        </>
      )}
    </Pagina>
  );
}

function LinhaDeDivida({ item }: { item: DividaCalculada }) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();
  const [aberto, setAberto] = useState(false);
  const [amortizando, setAmortizando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const { divida, resumo, tabela, quitacao } = item;
  const progresso = divida.parcelas === 0 ? 0 : resumo.parcelasPagas / divida.parcelas;

  const invalidar = () => cliente.invalidateQueries();

  const pagar = useMutation({
    mutationFn: () => pagarParcela(divida.id),
    onSuccess: async () => {
      await invalidar();
      mostrar(
        divida.contaId
          ? 'Parcela registrada: amortização como transferência, juros como despesa.'
          : 'Parcela registrada. Sem conta cadastrada, nenhum lançamento foi criado.',
      );
    },
  });

  const desfazer = useMutation({
    mutationFn: () => desfazerParcela(divida.id),
    onSuccess: invalidar,
  });

  const quitar = useMutation({
    mutationFn: () => quitarDivida(divida.id, hoje()),
    onSuccess: async () => {
      await invalidar();
      mostrar(`${divida.nome} quitada.`);
    },
  });

  const excluir = useMutation({
    mutationFn: () => excluirDivida(divida.id),
    onSuccess: invalidar,
  });

  return (
    <Cartao className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-slate-100">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: divida.cor ?? 'var(--color-borda-forte)' }}
            />
            {divida.nome}
          </p>
          <p className="truncate text-xs text-slate-500">
            {divida.instituicao && `${divida.instituicao} · `}
            {divida.sistema === 'price' ? 'Price' : 'SAC'} · {porcentagem(divida.taxaMensal)} a.m. (
            {porcentagem(taxaAnualDeMensal(divida.taxaMensal), 1)} a.a.)
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {resumo.parcelasPagas} de {divida.parcelas} pagas · acaba em {mesCurto(quitacao)}
            {/* O dia estava salvo desde sempre e não aparecia em lugar nenhum:
                quem cadastrava "primeira parcela dia 1º" não tinha como saber
                que o app tinha guardado o dia 1º. */}
            {resumo.proxima !== null && (
              <>
                {' '}
                · próxima em{' '}
                {formatarBR(vencimentoDaParcela(divida.primeiraParcela, resumo.proxima.numero))}
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Dinheiro centavos={resumo.saldoDevedor} className="text-slate-100" />
          {resumo.proxima && (
            <p className="text-xs text-slate-500">próxima {formatar(resumo.proxima.valor)}</p>
          )}
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-superficie-alta">
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: `${Math.min(100, progresso * 100)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        {resumo.parcelasRestantes > 0 && (
          <button
            onClick={() => pagar.mutate()}
            disabled={pagar.isPending}
            className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            Paguei mais uma
          </button>
        )}
        {resumo.parcelasPagas > 0 && (
          <button
            onClick={() => desfazer.mutate()}
            disabled={desfazer.isPending}
            className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            Desfazer
          </button>
        )}
        {resumo.parcelasRestantes > 0 && (
          <button
            onClick={() => setAmortizando((v) => !v)}
            className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
          >
            {amortizando ? 'Cancelar' : 'Amortizar'}
          </button>
        )}
        <button
          onClick={() => setAberto((v) => !v)}
          className={`text-xs text-slate-500 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          {aberto ? 'Fechar tabela' : 'Ver tabela'}
        </button>
        <button
          onClick={() => quitar.mutate()}
          title="Sai da lista sem apagar nada. Use quando a dívida acabou."
          className={`text-xs text-slate-600 hover:text-slate-300 ${ALVO_DE_TOQUE}`}
        >
          Quitar
        </button>
        <button
          onClick={() => setExcluindo((v) => !v)}
          title="Para a dívida cadastrada por engano."
          className={`text-xs text-slate-600 hover:text-red-400 ${ALVO_DE_TOQUE}`}
        >
          {excluindo ? 'Cancelar' : 'Excluir'}
        </button>
      </div>

      {amortizando && (
        <AmortizacaoExtraordinaria
          dividaId={divida.id}
          saldoDevedor={resumo.saldoDevedor}
          parcelasRestantes={resumo.parcelasRestantes}
          aoTerminar={() => setAmortizando(false)}
        />
      )}

      {excluindo && (
        <ConfirmacaoDeExclusao
          consequencia="Excluir apaga o cadastro da dívida. Os lançamentos das parcelas já pagas continuam na lista — eles são dinheiro que saiu."
          ajuda="Se a dívida acabou de verdade, use Quitar: ela sai da lista e o histórico fica."
          emAndamento={excluir.isPending}
          erro={excluir.isError ? (excluir.error as Error).message : null}
          aoConfirmar={() => excluir.mutate()}
          aoCancelar={() => setExcluindo(false)}
        />
      )}

      {aberto && (
        <div className="mt-3 space-y-2 rounded-lg border border-borda-forte bg-superficie-alta p-3">
          <div className="flex justify-between gap-3 text-xs text-slate-500">
            <span>Juros já pagos: {formatar(resumo.jurosJaPagos)}</span>
            <span>Ainda a pagar: {formatar(resumo.jurosAindaAPagar)}</span>
          </div>

          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-superficie-alta text-slate-500">
                <tr>
                  <th className="py-1 text-left font-normal">#</th>
                  <th className="py-1 text-right font-normal">Parcela</th>
                  <th className="py-1 text-right font-normal">Juros</th>
                  <th className="py-1 text-right font-normal">Amortiza</th>
                  <th className="py-1 text-right font-normal">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {tabela.map((linha) => (
                  <tr
                    key={linha.numero}
                    className={
                      linha.numero <= resumo.parcelasPagas ? 'text-slate-600' : 'text-slate-300'
                    }
                  >
                    <td className="py-0.5">{linha.numero}</td>
                    <td className="numero dinheiro py-0.5 text-right">{formatar(linha.valor)}</td>
                    <td className="numero dinheiro py-0.5 text-right text-amber-500/80">
                      {formatar(linha.juros)}
                    </td>
                    <td className="numero dinheiro py-0.5 text-right text-emerald-500/80">
                      {formatar(linha.amortizacao)}
                    </td>
                    <td className="numero dinheiro py-0.5 text-right">
                      {formatar(linha.saldoDevedor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Linhas apagadas já foram pagas. No Price o começo é quase todo juros: por isso metade
            das parcelas não significa metade da dívida.
          </p>
        </div>
      )}
    </Cartao>
  );
}

/**
 * Cadastro de dívida.
 *
 * A taxa é o dado que ninguém tem à mão — está no contrato, não na cabeça. Por
 * isso o formulário aceita os dois caminhos: quem sabe a taxa informa a taxa,
 * quem sabe a parcela informa a parcela e o app deduz a taxa por bisseção.
 *
 * A prévia ao vivo é o que transforma isso de burocracia em resposta: enquanto
 * se digita, a tela já mostra a parcela, o total de juros e o mês da quitação.
 */
export function FormularioDeDivida({ aoTerminar }: { aoTerminar: () => void }) {
  const cliente = useQueryClient();
  const contas = usarContas();
  const categorias = usarCategorias();

  const [nome, setNome] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [cor, setCor] = useState<string | null>(null);
  const [valor, setValor] = useState<Centavos>(0);
  const [parcelas, setParcelas] = useState('');
  const [sistema, setSistema] = useState<SistemaDeAmortizacao>('price');
  const [modoDaTaxa, setModoDaTaxa] = useState<'taxa' | 'parcela'>('taxa');
  const [taxaAnual, setTaxaAnual] = useState('');
  const [valorDaParcela, setValorDaParcela] = useState<Centavos>(0);
  const [primeira, setPrimeira] = useState<DataISO>(hoje());
  const [pagas, setPagas] = useState('0');
  const [contaId, setContaId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);

  const n = Number(parcelas);
  const jaPagas = Math.min(Number(pagas) || 0, n);

  // Os dois caminhos para a taxa. Pela parcela só faz sentido no Price, onde a
  // parcela é constante — no SAC ela muda todo mês e "a parcela" não existe.
  const taxaMensal =
    modoDaTaxa === 'taxa'
      ? taxaMensalDeAnual((Number(taxaAnual.replace(',', '.')) || 0) / 100)
      : (taxaImplicita(valor, valorDaParcela, n) ?? null);

  const podeCalcular = valor > 0 && n > 0 && taxaMensal !== null;

  const tabela = podeCalcular ? tabelaDeAmortizacao(valor, taxaMensal, n, sistema) : [];
  const totalDeJuros = tabela.reduce((soma, p) => soma + p.juros, 0);
  const ultima = tabela.length > 0 ? somarMeses(primeira, n - 1) : null;

  const valido = nome.trim() !== '' && podeCalcular && n >= 1;

  // Botão desabilitado sem dizer por quê é a pior forma de recusar: quem está
  // preenchendo não descobre qual campo falta e conclui que a tela quebrou.
  const faltando = [
    nome.trim() === '' && 'o nome',
    valor <= 0 && 'o valor financiado',
    n < 1 && 'o número de parcelas',
    modoDaTaxa === 'taxa' && taxaAnual.trim() === '' && 'a taxa',
    modoDaTaxa === 'parcela' && valorDaParcela <= 0 && 'o valor da parcela',
    modoDaTaxa === 'parcela' &&
      valorDaParcela > 0 &&
      n >= 1 &&
      valor > 0 &&
      taxaMensal === null &&
      'uma parcela compatível: com esse valor não existe taxa possível',
  ].filter((item): item is string => typeof item === 'string');

  const criar = useMutation({
    mutationFn: () =>
      criarDivida({
        nome,
        instituicao,
        cor,
        valorFinanciado: valor,
        taxaMensal: taxaMensal ?? 0,
        parcelas: n,
        sistema,
        primeiraParcela: primeira,
        parcelasPagas: jaPagas,
        contaId,
        categoriaId,
      }),
    onSuccess: async () => {
      await cliente.invalidateQueries();
      aoTerminar();
    },
  });

  const doTipo = (categorias.data ?? []).filter((c) => c.tipo === 'despesa');

  return (
    <Cartao className="space-y-4 p-4">
      <Campo rotulo="O que é">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Financiamento do apartamento"
          autoFocus
          className={ENTRADA}
        />
      </Campo>

      <CampoInstituicao
        instituicao={instituicao}
        cor={cor}
        aoMudar={(nova, novaCor) => {
          setInstituicao(nova);
          setCor(novaCor);
        }}
      />

      <CampoValor
        valor={valor}
        aoMudar={setValor}
        rotulo="Valor financiado"
      />
      <p className="-mt-2 text-xs leading-relaxed text-slate-500">
        O que foi financiado, não o preço do bem: a entrada que você já pagou fica de fora.
      </p>

      <Campo rotulo="Número de parcelas">
        <input
          inputMode="numeric"
          value={parcelas}
          onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="360"
          className={ENTRADA}
        />
      </Campo>

      <Campo
        rotulo="Sistema"
        ajuda={
          sistema === 'price'
            ? 'Parcela fixa. É o do crédito pessoal, do carro e do consignado.'
            : 'Amortização fixa e parcela decrescente. É o padrão do financiamento imobiliário, e paga menos juros no total.'
        }
      >
        <div className="flex flex-wrap gap-2">
          <Chip ativo={sistema === 'price'} aoClicar={() => setSistema('price')}>
            Price — parcela fixa
          </Chip>
          <Chip
            ativo={sistema === 'sac'}
            aoClicar={() => {
              setSistema('sac');
              setModoDaTaxa('taxa');
            }}
          >
            SAC — parcela cai
          </Chip>
        </div>
      </Campo>

      <Campo rotulo="Juros">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Chip ativo={modoDaTaxa === 'taxa'} aoClicar={() => setModoDaTaxa('taxa')}>
              Sei a taxa
            </Chip>
            {sistema === 'price' && (
              <Chip ativo={modoDaTaxa === 'parcela'} aoClicar={() => setModoDaTaxa('parcela')}>
                Sei a parcela
              </Chip>
            )}
          </div>

          {modoDaTaxa === 'taxa' ? (
            <input
              inputMode="decimal"
              value={taxaAnual}
              onChange={(e) => setTaxaAnual(e.target.value)}
              placeholder="Taxa ao ano (%) — ex.: 10,5"
              className={ENTRADA}
            />
          ) : (
            <CampoValor
              valor={valorDaParcela}
              aoMudar={setValorDaParcela}
              rotulo="Valor da parcela"
            />
          )}

          <p className="text-xs leading-relaxed text-slate-500">
            {modoDaTaxa === 'taxa'
              ? 'Ao ano, como o contrato informa. O app converte para mensal — 12% ao ano não é 1% ao mês, porque juros compõem.'
              : taxaMensal === null && valorDaParcela > 0
                ? 'Com esse valor de parcela não existe taxa possível: parcela vezes prazo precisa ser maior que o financiado.'
                : 'O app deduz a taxa a partir do que o banco informa. É o caminho de quem tem o boleto e não o contrato.'}
          </p>
        </div>
      </Campo>

      <Campo rotulo="Data da primeira parcela">
        <input
          type="date"
          value={primeira}
          onChange={(e) => e.target.value && setPrimeira(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      <Campo
        rotulo="Quantas já foram pagas"
        ajuda="Quase ninguém começa a usar um app no mês em que assinou o contrato. Sem este número, o saldo devedor nasce errado."
      >
        <input
          inputMode="numeric"
          value={pagas}
          onChange={(e) => setPagas(e.target.value.replace(/\D/g, '').slice(0, 3))}
          className={ENTRADA}
        />
      </Campo>

      <Campo
        rotulo="De qual conta sai a parcela (opcional)"
        ajuda="Informando, o app cria a recorrência com prazo: a parcela aparece sozinha todo mês e some no mês da quitação. Sem isso, a dívida não pesa no fluxo de caixa."
      >
        <div className="flex flex-wrap gap-2">
          {(contas.data ?? []).filter(podePagarFatura).map((conta) => (
            <Chip
              key={conta.id}
              ativo={contaId === conta.id}
              aoClicar={() => setContaId(contaId === conta.id ? null : conta.id)}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: conta.cor ?? 'var(--color-borda-forte)' }}
                />
                {conta.nome}
              </span>
            </Chip>
          ))}
        </div>
      </Campo>

      {contaId && (
        <Campo rotulo="Categoria da parcela (opcional)">
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
      )}

      {podeCalcular && tabela.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 text-sm">
          <p className="text-slate-200">
            {sistema === 'price' ? (
              <>
                {n}x de <strong>{formatar(parcelaPrice(valor, taxaMensal, n))}</strong>
              </>
            ) : (
              <>
                Primeira parcela <strong>{formatar(tabela[0]!.valor)}</strong>, última{' '}
                <strong>{formatar(tabela[tabela.length - 1]!.valor)}</strong>
              </>
            )}
            {' · '}
            {porcentagem(taxaMensal)} a.m. ({porcentagem(taxaAnualDeMensal(taxaMensal), 1)} a.a.)
          </p>
          <p className="text-xs text-slate-400">
            Você vai pagar <strong>{formatar(totalDeJuros)}</strong> de juros ao todo — {' '}
            {porcentagem(totalDeJuros / valor, 0)} do valor financiado.
            {ultima && <> Acaba em {mesCurto(ultima)}.</>}
          </p>
        </div>
      )}

      {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

      {faltando.length > 0 && (
        <p className="text-xs leading-relaxed text-amber-400/80">
          Falta {faltando.join(', ')}.
        </p>
      )}

      <div className="flex gap-2">
        <Botao aoClicar={() => criar.mutate()} desabilitado={!valido || criar.isPending}>
          {criar.isPending ? 'Salvando…' : 'Salvar dívida'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}

/**
 * Amortização extraordinária (§4.7).
 *
 * Só dava para pagar a próxima parcela. Quem recebe um dinheiro e abate as
 * ÚLTIMAS não tinha como registrar — e é justamente a operação que mais muda o
 * resultado de um financiamento longo.
 *
 * A tela pede o número de parcelas que sumiram porque quem sabe é o BANCO:
 * cada instituição arredonda de um jeito, e recalcular por fora daria um
 * cronograma que não bate com o extrato. O app faz a conta do dinheiro; o
 * cronograma quem dita é o contrato.
 */
function AmortizacaoExtraordinaria({
  dividaId,
  saldoDevedor,
  parcelasRestantes,
  aoTerminar,
}: {
  dividaId: string;
  saldoDevedor: Centavos;
  parcelasRestantes: number;
  aoTerminar: () => void;
}) {
  const cliente = useQueryClient();
  const { mostrar } = usarAviso();

  const [valor, setValor] = useState<Centavos>(0);
  const [data, setData] = useState<DataISO>(hoje());
  const [modo, setModo] = useState<'prazo' | 'parcela'>('prazo');
  const [reduzidas, setReduzidas] = useState('');

  const registradas = useQuery({
    queryKey: ['amortizacoes', dividaId],
    queryFn: () => listarAmortizacoes(dividaId),
  });

  const invalidar = async () => {
    await cliente.invalidateQueries();
  };

  const amortizar = useMutation({
    mutationFn: () =>
      amortizarDivida({
        dividaId,
        valor,
        data,
        modo,
        parcelasReduzidas: Number(reduzidas) || 0,
      }),
    onSuccess: async () => {
      await invalidar();
      aoTerminar();
      mostrar('Amortização registrada.');
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => excluirAmortizacao(id),
    onSuccess: invalidar,
  });

  const quita = valor >= saldoDevedor && saldoDevedor > 0;
  const valido =
    valor > 0 && (modo === 'parcela' || quita || (Number(reduzidas) || 0) > 0);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-borda-forte bg-superficie-alta p-3">
      <CampoValor valor={valor} aoMudar={setValor} rotulo="Quanto você pagou a mais" autoFocus />

      {quita && (
        <p className="rounded-md border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
          Isso cobre o saldo devedor inteiro: a dívida fica quitada.
        </p>
      )}

      {!quita && (
        <>
          <Campo
            rotulo="O que o banco reduziu"
            ajuda={
              modo === 'prazo'
                ? 'A parcela continua a mesma e o financiamento acaba antes. Economiza mais juros, porque juros correm sobre tempo.'
                : 'O prazo continua e a parcela cai. Alivia o mês, economiza menos.'
            }
          >
            <div className="flex flex-wrap gap-2">
              <Chip ativo={modo === 'prazo'} aoClicar={() => setModo('prazo')}>
                O prazo
              </Chip>
              <Chip ativo={modo === 'parcela'} aoClicar={() => setModo('parcela')}>
                A parcela
              </Chip>
            </div>
          </Campo>

          {modo === 'prazo' && (
            <Campo
              rotulo={`Quantas parcelas sumiram (de ${parcelasRestantes} restantes)`}
              ajuda="O número é o do banco. Cada instituição arredonda de um jeito, e uma conta nossa daria um cronograma que não bate com o extrato."
            >
              <input
                inputMode="numeric"
                value={reduzidas}
                onChange={(e) => setReduzidas(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="12"
                className={ENTRADA}
              />
            </Campo>
          )}
        </>
      )}

      <Campo rotulo="Quando">
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className={ENTRADA}
        />
      </Campo>

      {amortizar.isError && (
        <p className="text-sm text-red-400">{(amortizar.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <Botao aoClicar={() => amortizar.mutate()} desabilitado={!valido || amortizar.isPending}>
          {amortizar.isPending ? 'Registrando…' : 'Registrar amortização'}
        </Botao>
        <Botao tipo="secundario" aoClicar={aoTerminar}>
          Cancelar
        </Botao>
      </div>

      {(registradas.data ?? []).length > 0 && (
        <ul className="space-y-1 border-t border-borda pt-2">
          {registradas.data?.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-slate-500">
                {formatarBR(item.data)} ·{' '}
                {item.modo === 'prazo'
                  ? `−${item.parcelasReduzidas} parcela(s)`
                  : 'parcela menor'}
              </span>
              <span className="flex items-baseline gap-3">
                <Dinheiro centavos={item.valor} className="text-slate-300" />
                <button
                  onClick={() => remover.mutate(item.id)}
                  className="text-slate-600 hover:text-red-400"
                >
                  remover
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">
        O extra abate principal puro — não tem juros. É por isso que ele compensa, e é por isso que
        a parcela normal, essa sim, se divide em amortização e juros.
      </p>
    </div>
  );
}
