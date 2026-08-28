// Parser de OFX (§6.1, §6.3).
//
// OFX é o formato preferencial porque cada transação já vem com um FITID —
// identificador único gerado pelo banco. É ele que impede o mesmo extrato
// importado duas vezes de duplicar lançamento, de graça e com confiabilidade
// que nenhuma heurística alcança.
//
// O arquivo nunca sai do navegador: o parse é 100% client-side (§1). Extrato
// bancário não precisa passar por servidor nenhum, nem pelo nosso.
//
// Duas gerações de OFX convivem no Brasil:
//   OFX 1.x — SGML, tags sem fechamento: <TRNAMT>-50.00 e quebra de linha.
//   OFX 2.x — XML de verdade, com </TRNAMT>.
// O parser trata as duas lendo o texto entre a tag e o próximo delimitador.

import { paraCentavos, type Centavos } from '../dominio/dinheiro';
import { ehDataValida, type DataISO } from '../dominio/datas';

export type TransacaoOFX = {
  /** Identificador único do banco (§6.3). É a chave da deduplicação. */
  fitid: string;
  data: DataISO;
  valor: Centavos;
  descricao: string;
  tipo: string | null;
};

export type ExtratoOFX = {
  contaDoArquivo: string | null;
  transacoes: TransacaoOFX[];
  periodoInicio: DataISO | null;
  periodoFim: DataISO | null;
};

export class ErroDeOFX extends Error {}

/** Texto entre `<TAG>` e o próximo `<` ou fim de linha. Serve para SGML e XML. */
function tag(bloco: string, nome: string): string | null {
  const encontrado = new RegExp(`<${nome}>([^<\r\n]*)`, 'i').exec(bloco);
  const valor = encontrado?.[1]?.trim();
  return valor ? valor : null;
}

/**
 * Data do OFX: `AAAAMMDD` seguido de hora e fuso opcionais —
 * `20260827`, `20260827120000`, `20260827120000[-3:BRT]`.
 *
 * A hora é descartada de propósito. Guardar o horário do banco só criaria
 * ambiguidade de fuso num app que trabalha com `date` puro (§13.1).
 */
export function lerDataOFX(bruta: string): DataISO | null {
  const digitos = bruta.trim().replace(/[^0-9]/g, '');
  if (digitos.length < 8) return null;

  const iso = `${digitos.slice(0, 4)}-${digitos.slice(4, 6)}-${digitos.slice(6, 8)}`;
  return ehDataValida(iso) ? iso : null;
}

/**
 * Valor do OFX. O padrão manda ponto decimal, mas banco brasileiro às vezes
 * emite vírgula — e um extrato lido com o decimal errado erra por 100x sem
 * avisar, então os dois formatos são aceitos.
 */
export function lerValorOFX(bruto: string): Centavos | null {
  const limpo = bruto.trim().replace(/\s/g, '');
  if (limpo === '') return null;

  // O ÚLTIMO separador é o decimal; todos os anteriores são milhar. Vale para
  // "-1.234,56" e para "1,234.56" sem precisar adivinhar o idioma do arquivo.
  const ultimoSeparador = Math.max(limpo.lastIndexOf(','), limpo.lastIndexOf('.'));
  const normalizado =
    ultimoSeparador === -1
      ? limpo
      : limpo.slice(0, ultimoSeparador).replace(/[.,]/g, '') +
        '.' +
        limpo.slice(ultimoSeparador + 1);

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? paraCentavos(numero) : null;
}

export function analisarOFX(conteudo: string): ExtratoOFX {
  if (!/<OFX>/i.test(conteudo) && !/<STMTTRN>/i.test(conteudo)) {
    throw new ErroDeOFX(
      'Este arquivo não parece ser um OFX. Baixe o extrato pela opção "Exportar" ou "Salvar" do internet banking.',
    );
  }

  const contaDoArquivo = tag(conteudo, 'ACCTID');
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1);

  const transacoes: TransacaoOFX[] = [];

  for (const bruto of blocos) {
    const bloco = bruto.split(/<\/STMTTRN>/i)[0] ?? bruto;

    const fitid = tag(bloco, 'FITID');
    const dataBruta = tag(bloco, 'DTPOSTED');
    const valorBruto = tag(bloco, 'TRNAMT');

    // Sem FITID, data ou valor a linha não é utilizável. Descartar em silêncio
    // seria pior do que falhar: o usuário acharia que importou tudo.
    if (!fitid || !dataBruta || !valorBruto) continue;

    const data = lerDataOFX(dataBruta);
    const valor = lerValorOFX(valorBruto);
    if (data === null || valor === null) continue;

    // MEMO costuma trazer o texto mais útil; NAME é o fallback.
    const descricao = tag(bloco, 'MEMO') ?? tag(bloco, 'NAME') ?? '';

    transacoes.push({
      fitid,
      data,
      valor,
      descricao: descricao.replace(/\s+/g, ' ').trim(),
      tipo: tag(bloco, 'TRNTYPE'),
    });
  }

  if (transacoes.length === 0) {
    throw new ErroDeOFX(
      'Nenhuma transação encontrada no arquivo. Confira se o período exportado tem movimentação.',
    );
  }

  const datas = transacoes.map((t) => t.data).sort();

  return {
    contaDoArquivo,
    transacoes,
    periodoInicio: datas[0] ?? null,
    periodoFim: datas[datas.length - 1] ?? null,
  };
}

/**
 * Duplicata DENTRO do próprio arquivo. Raro, mas acontece em extrato exportado
 * duas vezes e concatenado — e o índice único do banco recusaria o lote inteiro.
 */
export function removerDuplicadasDoArquivo(transacoes: TransacaoOFX[]): {
  unicas: TransacaoOFX[];
  removidas: number;
} {
  const vistos = new Set<string>();
  const unicas: TransacaoOFX[] = [];

  for (const transacao of transacoes) {
    if (vistos.has(transacao.fitid)) continue;
    vistos.add(transacao.fitid);
    unicas.push(transacao);
  }

  return { unicas, removidas: transacoes.length - unicas.length };
}
