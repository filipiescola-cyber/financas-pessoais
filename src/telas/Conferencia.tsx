import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatarBR } from '../dominio/datas';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { conferir } from '../dominio/orcamento';
import { registrarConferencia } from '../dados/orcamentos';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { usarContasComSaldo } from '../dados/usarContas';
import { CampoValor } from '../ui/CampoValor';
import { usarAviso } from '../ui/Aviso';
import { Botao, Cartao, Chip, Dinheiro, Nota, Pagina, Secao, Vazio } from '../ui/base';

/**
 * Conferência de saldo (§5.3).
 *
 * "Sem integração bancária o saldo do app derrapa com o tempo. Antídoto
 * obrigatório."
 *
 * A diferença nunca é corrigida por trás: vira um lançamento explícito na
 * categoria "Ajuste de saldo". Consertar o saldo em silêncio faria o histórico
 * mentir, e o histórico é a única coisa que o app tem.
 */
export function Conferencia() {
  const contas = usarContasComSaldo();
  const [contaId, setContaId] = useState<string | null>(null);

  const elegiveis = (contas.data ?? []).filter((c) => c.tipo !== 'cartao_credito');
  const conta = elegiveis.find((c) => c.id === contaId) ?? null;

  if (contas.isPending) {
    return (
      <Pagina titulo="Conferência de saldo">
        <p className="text-slate-400">Carregando…</p>
      </Pagina>
    );
  }

  return (
    <Pagina titulo="Conferência de saldo" subtitulo="O que o banco diz x o que o app diz">
      <Nota>
        Vale fazer uma vez por mês, no dia 1º. Sem integração bancária o saldo derrapa com o
        tempo, e a conferência é o que impede a diferença de virar bola de neve.
      </Nota>

      {elegiveis.length === 0 ? (
        <Vazio titulo="Nenhuma conta para conferir" />
      ) : (
        <>
          <Secao titulo="Qual conta">
            <div className="flex flex-wrap gap-2">
              {elegiveis.map((c) => (
                <Chip key={c.id} ativo={contaId === c.id} aoClicar={() => setContaId(c.id)}>
                  {c.nome}
                </Chip>
              ))}
            </div>
          </Secao>

          {conta && (
            <FormularioDeConferencia
              key={conta.id}
              contaId={conta.id}
              nome={conta.nome}
              saldoDoApp={conta.saldoAtual}
              conferidoEm={conta.dataConferencia}
              saldoConferido={conta.saldoConferido}
            />
          )}
        </>
      )}
    </Pagina>
  );
}

function FormularioDeConferencia({
  contaId,
  nome,
  saldoDoApp,
  conferidoEm,
  saldoConferido,
}: {
  contaId: string;
  nome: string;
  saldoDoApp: Centavos;
  conferidoEm: string | null;
  saldoConferido: Centavos | null;
}) {
  const invalidar = usarInvalidarTransacoes();
  const { mostrar } = usarAviso();
  const [saldoReal, setSaldoReal] = useState<Centavos>(saldoDoApp);
  const [conferido, setConferido] = useState(false);

  const resultado = conferir(saldoDoApp, saldoReal);

  const registrar = useMutation({
    mutationFn: (criarAjuste: boolean) =>
      registrarConferencia({
        contaId,
        saldoReal,
        diferenca: resultado.diferenca,
        criarAjuste,
      }),
    onSuccess: async (_, criarAjuste) => {
      await invalidar();
      mostrar(
        criarAjuste
          ? 'Conferência registrada e ajuste lançado.'
          : 'Conferência registrada, sem ajuste.',
      );
      setConferido(false);
    },
  });

  return (
    <Secao titulo={nome}>
      <Cartao className="space-y-4 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-400">Saldo no app</span>
          <Dinheiro centavos={saldoDoApp} className="text-lg text-slate-100" />
        </div>

        <CampoValor
          valor={saldoReal}
          aoMudar={(v) => {
            setSaldoReal(v);
            setConferido(true);
          }}
          rotulo="Saldo real, o que está no extrato"
        />

        {conferidoEm && saldoConferido !== null && (
          <p className="text-xs text-slate-600">
            Última conferência em {formatarBR(conferidoEm)}:{' '}
            {formatar(saldoConferido)}. Esse número é guardado só para comparação — ele nunca é
            usado como saldo.
          </p>
        )}

        {conferido && (
          <div
            className={`rounded-lg border px-4 py-3 ${
              resultado.bate
                ? 'border-emerald-800/50 bg-emerald-950/30'
                : 'border-amber-800/40 bg-amber-950/20'
            }`}
          >
            {resultado.bate ? (
              <p className="text-sm text-emerald-200">
                Bate exatamente. Nada a ajustar.
              </p>
            ) : (
              <>
                <p className="text-sm text-amber-200">
                  Diferença de{' '}
                  <span className="numero">{formatar(Math.abs(resultado.diferenca))}</span>
                  {resultado.diferenca > 0
                    ? ' — o banco tem mais do que o app achava.'
                    : ' — o banco tem menos do que o app achava.'}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
                  Quase sempre é lançamento esquecido, taxa que não foi registrada ou gasto em
                  dinheiro. O ajuste entra como lançamento visível na categoria "Ajuste de saldo",
                  nunca como correção silenciosa.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Botao
            aoClicar={() => registrar.mutate(!resultado.bate)}
            desabilitado={registrar.isPending}
          >
            {resultado.bate ? 'Registrar conferência' : 'Registrar e lançar o ajuste'}
          </Botao>
          {!resultado.bate && (
            <Botao
              tipo="secundario"
              aoClicar={() => registrar.mutate(false)}
              desabilitado={registrar.isPending}
              titulo="Guarda o número conferido sem criar lançamento"
            >
              Só registrar, sem ajustar
            </Botao>
          )}
        </div>

        {!resultado.bate && (
          <p className="text-xs text-slate-500">
            Se a diferença for grande, vale procurar o lançamento faltando antes de ajustar — o
            ajuste resolve o saldo, mas não conta de onde veio o dinheiro.
          </p>
        )}
      </Cartao>
    </Secao>
  );
}
