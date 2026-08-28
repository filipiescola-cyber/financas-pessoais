import { useState, type FormEvent } from 'react';
import { formatar, type Centavos } from '../dominio/dinheiro';
import { empresaComSaldoSuspeito, entraNoConsolidado, rotuloDaContaEmpresa } from '../dominio/saldo';
import { CampoValor } from '../ui/CampoValor';
import {
  Botao,
  Campo,
  Cartao,
  CartaoIndicador,
  Chip,
  Dinheiro,
  ENTRADA,
  Nota,
  Pagina,
  Secao,
  Vazio,
} from '../ui/base';
import {
  usarArquivarConta,
  usarContas,
  usarContasComSaldo,
  usarCriarConta,
  usarDesarquivarConta,
} from '../dados/usarContas';
import { ROTULO_TIPO_CONTA, TIPOS_DE_CONTA_CADASTRAVEIS, type TipoDeConta } from '../dados/tipos';

export function Contas() {
  const contas = usarContasComSaldo();
  const todas = usarContas(true);
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);

  if (contas.isPending) {
    return (
      <Pagina titulo="Contas">
        <p className="text-slate-400">Carregando…</p>
      </Pagina>
    );
  }

  if (contas.isError) {
    return (
      <Pagina titulo="Contas">
        <p className="text-red-400">Erro ao carregar: {(contas.error as Error).message}</p>
      </Pagina>
    );
  }

  const lista = contas.data;
  const disponiveis = lista.filter(entraNoConsolidado);
  const empresa = lista.find((c) => c.tipo === 'empresa');
  const consolidado = disponiveis.reduce((total, c) => total + c.saldoAtual, 0);
  const inativas = (todas.data ?? []).filter((c) => !c.ativo);

  return (
    <Pagina
      titulo="Contas"
      subtitulo="Onde o dinheiro está"
      acao={
        <Botao
          aoClicar={() => setMostrandoFormulario((v) => !v)}
          tipo={mostrandoFormulario ? 'secundario' : 'primario'}
        >
          {mostrandoFormulario ? 'Cancelar' : 'Nova conta'}
        </Botao>
      }
    >
      {mostrandoFormulario && <FormularioConta aoTerminar={() => setMostrandoFormulario(false)} />}

      {lista.length === 0 && !mostrandoFormulario ? (
        <Vazio
          titulo="Nenhuma conta cadastrada"
          descricao="Comece pela conta onde o salário cai. A carteira e a conta Empresa vêm depois, se fizerem sentido para você."
          acao={<Botao aoClicar={() => setMostrandoFormulario(true)}>Cadastrar a primeira</Botao>}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <CartaoIndicador
              rotulo="Saldo"
              sotaque="verde"
              valor={formatar(consolidado)}
              detalhe="Soma de conta corrente, poupança, carteira e investimento. Não inclui Empresa, dívidas nem faturas."
            />
            {empresa && (
              <CartaoIndicador
                rotulo={rotuloDaContaEmpresa(empresa.saldoAtual)}
                sotaque="neutro"
                valor={formatar(Math.abs(empresa.saldoAtual))}
                detalhe="Dinheiro seu parado dentro do negócio. É recebível, não caixa — por isso fica fora do disponível."
              />
            )}
          </div>

          {empresa && empresaComSaldoSuspeito(empresa.saldoAtual) && (
            <Nota tom="atencao">
              Saldo negativo na conta Empresa quase sempre é erro de lançamento: pró-labore marcado
              como devolução de aporte. Pró-labore é receita e não reduz esta conta.
            </Nota>
          )}

          <Secao titulo="Suas contas">
            <Cartao>
              <ul className="divide-y divide-borda">
                {disponiveis.map((conta) => (
                  <LinhaDeConta
                    key={conta.id}
                    id={conta.id}
                    nome={conta.nome}
                    detalhe={
                      conta.instituicao
                        ? `${ROTULO_TIPO_CONTA[conta.tipo]} · ${conta.instituicao}`
                        : ROTULO_TIPO_CONTA[conta.tipo]
                    }
                    valor={conta.saldoAtual}
                  />
                ))}
                {empresa && (
                  <LinhaDeConta
                    id={empresa.id}
                    nome={empresa.nome}
                    detalhe="Fronteira com o negócio"
                    valor={empresa.saldoAtual}
                    neutra
                  />
                )}
              </ul>
            </Cartao>
          </Secao>
        </>
      )}

      {inativas.length > 0 && <BlocoArquivadas contas={inativas} />}
    </Pagina>
  );
}

function LinhaDeConta({
  id,
  nome,
  detalhe,
  valor,
  neutra = false,
}: {
  id: string;
  nome: string;
  detalhe: string;
  valor: Centavos;
  neutra?: boolean;
}) {
  const arquivar = usarArquivarConta();

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-slate-100">{nome}</p>
        <p className="truncate text-xs text-slate-500">{detalhe}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <Dinheiro
          centavos={neutra ? Math.abs(valor) : valor}
          className={neutra ? 'text-slate-300' : valor < 0 ? 'text-red-400' : 'text-slate-100'}
        />
        <button
          onClick={() => arquivar.mutate(id)}
          disabled={arquivar.isPending}
          title="Arquivar — o histórico é preservado"
          className="text-xs text-slate-600 transition hover:text-slate-300"
        >
          arquivar
        </button>
      </div>
    </li>
  );
}

function BlocoArquivadas({ contas }: { contas: { id: string; nome: string; tipo: TipoDeConta }[] }) {
  const desarquivar = usarDesarquivarConta();

  return (
    <Secao titulo="Arquivadas">
      <Cartao>
        <ul className="divide-y divide-borda">
          {contas.map((conta) => (
            <li key={conta.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-slate-500">
                {conta.nome} · {ROTULO_TIPO_CONTA[conta.tipo]}
              </span>
              <button
                onClick={() => desarquivar.mutate(conta.id)}
                className="text-xs text-slate-600 transition hover:text-slate-300"
              >
                reativar
              </button>
            </li>
          ))}
        </ul>
      </Cartao>
      <p className="text-xs text-slate-600">
        Conta arquivada some dos seletores e do saldo, mas continua nos relatórios dos meses
        fechados.
      </p>
    </Secao>
  );
}

function FormularioConta({ aoTerminar }: { aoTerminar: () => void }) {
  const criar = usarCriarConta();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoDeConta>('corrente');
  const [instituicao, setInstituicao] = useState('');
  const [saldoInicial, setSaldoInicial] = useState<Centavos>(0);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (nome.trim() === '') return;
    await criar.mutateAsync({ nome, tipo, instituicao, saldoInicial });
    aoTerminar();
  }

  return (
    <form onSubmit={aoEnviar}>
      <Cartao className="space-y-4 p-4">
        <Campo rotulo="Nome">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Conta corrente, Carteira, Empresa…"
            autoFocus
            className={ENTRADA}
          />
        </Campo>

        <Campo
          rotulo="Tipo"
          ajuda={
            tipo === 'empresa'
              ? 'Conta de fronteira com o negócio. Aporte é transferência, não despesa. Só pode existir uma.'
              : tipo === 'carteira'
                ? 'Dinheiro físico. Não vale caçar cada R$ 5 — o acerto é a contagem mensal.'
                : undefined
          }
        >
          <div className="flex flex-wrap gap-2">
            {TIPOS_DE_CONTA_CADASTRAVEIS.map((t) => (
              <Chip key={t} ativo={tipo === t} aoClicar={() => setTipo(t)}>
                {ROTULO_TIPO_CONTA[t]}
              </Chip>
            ))}
          </div>
        </Campo>

        <Campo rotulo="Instituição (opcional)">
          <input
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value)}
            className={ENTRADA}
          />
        </Campo>

        <CampoValor valor={saldoInicial} aoMudar={setSaldoInicial} rotulo="Saldo inicial" />
        <p className="-mt-2 text-xs leading-relaxed text-slate-500">
          O saldo do dia 1º deste mês, não o de hoje. Começar no dia 1º entrega um mês fechado de
          verdade já na primeira virada.
        </p>

        {criar.isError && <p className="text-sm text-red-400">{(criar.error as Error).message}</p>}

        <div className="flex gap-2 pt-1">
          <Botao submit desabilitado={criar.isPending || nome.trim() === ''}>
            {criar.isPending ? 'Salvando…' : 'Salvar'}
          </Botao>
          <Botao tipo="secundario" aoClicar={aoTerminar}>
            Cancelar
          </Botao>
        </div>
      </Cartao>
    </form>
  );
}
