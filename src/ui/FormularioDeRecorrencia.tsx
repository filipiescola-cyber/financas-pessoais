import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { CampoValor } from './CampoValor';
import { usarContas } from '../dados/usarContas';
import { usarCategorias } from '../dados/usarTransacoes';
import { criarRecorrencia } from '../dados/recorrencias';
import { usarFeriados } from '../dados/usarFeriados';
import {
  CampoInicio,
  CampoPrazo,
  CampoQuando,
  diaEhValido,
  inicioEscolhido,
  terminoEscolhido,
  type ModoDePrazo,
} from './CampoQuando';
import { valorDaOcorrencia, type RegraDoDia } from '../dominio/recorrencias';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { Botao, Campo, Cartao, Chip, ENTRADA } from './base';
import { ChipsDeConta } from './ChipsDeConta';


/**
 * Cadastro de recorrência fora do onboarding.
 *
 * Antes só existia lá dentro: quem trocasse de emprego ou assinasse um serviço
 * novo depois não tinha como registrar, e a projeção ficava desatualizada sem
 * que houvesse onde consertar.
 */
export function FormularioRecorrencia({
  aoTerminar,
  contaFixa = null,
}: {
  aoTerminar: () => void;
  /** Quando a tela já sabe a conta — o cartão, em Faturas. */
  contaFixa?: string | null;
}) {
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
  const [contaEscolhida, setContaId] = useState<string | null>(contaFixa);
  const contaId = contaFixa ?? contaEscolhida;
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [passo, setPasso] = useState<'nao' | 'sobe' | 'desce'>('nao');
  const [valorDoPasso, setValorDoPasso] = useState<Centavos>(0);

  const feriados = usarFeriados();
  // Cartão sai daqui: assinatura de cartão é cobrança da FATURA, e mora na aba
  // de Faturas, ao lado da fatura em que ela vai entrar. Misturada aqui, a
  // pessoa cadastrava uma cobrança de cartão sem nunca ver onde ela cai.
  const disponiveis = (contas.data ?? []).filter(
    (c) => c.tipo !== 'divida' && c.tipo !== 'cartao_credito',
  );
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

      {/* Com a conta já decidida pela tela — o cartão, em Faturas — perguntar
          de novo é oferecer a resposta errada: as outras contas nem cabem ali. */}
      {contaFixa === null && (
        <Campo rotulo="Conta">
          <ChipsDeConta
            contas={disponiveis}
            escolhida={contaId}
            aoEscolher={(id) => setContaId(id)}
          />
        </Campo>
      )}

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
