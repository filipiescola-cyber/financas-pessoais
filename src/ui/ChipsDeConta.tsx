import { Chip } from './base';

export type ContaParaEscolher = {
  id: string;
  nome: string;
  tipo: string;
  cor: string | null;
};

/**
 * Escolher a conta, com o cartão em bloco separado (§5.1).
 *
 * O mesmo banco vira duas contas no app — a corrente e o cartão — e elas
 * costumam ter o mesmo apelido. Lado a lado numa fila só, viram dois chips
 * escritos "Nubank", e escolher o errado troca uma compra parcelada por uma
 * saída de caixa de hoje: o erro mais caro que um seletor de conta permite.
 *
 * Mora aqui, e não dentro de uma tela, porque são cinco lugares que perguntam
 * a mesma coisa — lançamento rápido, lote, modelo, recorrência e transferência.
 * Enquanto o componente vivia numa tela só, as outras quatro continuavam
 * misturando.
 *
 * O ponto colorido vem da instituição (§4): é ele que faz reconhecer o banco
 * antes de ler o nome, que é justamente onde o nome não resolve.
 */
export function ChipsDeConta({
  contas,
  escolhida,
  aoEscolher,
}: {
  contas: readonly ContaParaEscolher[];
  escolhida: string | null;
  aoEscolher: (id: string) => void;
}) {
  const correntes = contas.filter((c) => c.tipo !== 'cartao_credito');
  const cartoes = contas.filter((c) => c.tipo === 'cartao_credito');

  const chip = (c: ContaParaEscolher) => (
    <Chip key={c.id} ativo={escolhida === c.id} aoClicar={() => aoEscolher(c.id)}>
      <span className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: c.cor ?? 'var(--color-borda-forte)' }}
        />
        {c.nome}
      </span>
    </Chip>
  );

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">{correntes.map(chip)}</div>

      {cartoes.length > 0 && (
        <>
          <span className="mt-3 block text-[11px] uppercase tracking-wider text-slate-500">
            cartão
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">{cartoes.map(chip)}</div>
        </>
      )}
    </>
  );
}
