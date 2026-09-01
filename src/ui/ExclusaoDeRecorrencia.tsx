import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contarGeradosDaRecorrencia, excluirRecorrencia } from '../dados/recorrencias';
import { usarInvalidarTransacoes } from '../dados/usarInvalidacao';
import { ConfirmacaoDeExclusao } from './ConfirmacaoDeExclusao';

export function ExclusaoDeRecorrencia({
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
