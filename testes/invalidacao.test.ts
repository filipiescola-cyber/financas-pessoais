import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DERIVADO_DE_TRANSACAO, chaves } from '../src/dados/chaves';

/**
 * Toda consulta que nasce de transação precisa estar na lista de invalidação.
 *
 * Este teste existe porque a mesma falha aconteceu duas vezes, e as duas de
 * forma silenciosa. O comentário no topo de `chaves.ts` já a previa: "a lista
 * feita à mão em cada tela sempre fica incompleta". Centralizar a lista
 * resolveu metade do problema — a outra metade é lembrar de acrescentar a
 * consulta NOVA, e disso nada avisava.
 *
 * O sintoma nunca é um erro. É um número velho na tela: a conferência que
 * registra o ajuste e continua mostrando a mesma diferença, convidando a
 * registrar de novo; a fatura que segue devendo o que já foi pago. Saldo é
 * calculado e não armazenado (§13.2), então quase todo número do app deriva de
 * transação — e cache que não invalida é exatamente o armazenamento que o
 * §13.2 proíbe, só que escondido.
 *
 * Lê o código-fonte pela mesma razão que o teste do backup lê as migrations
 * (§13.4): é a única fonte que não depende de alguém lembrar.
 */
const FONTE = join(__dirname, '..', 'src');

/**
 * Consultas que NÃO nascem de transação, com o motivo.
 *
 * Cadastro, calendário e preferência mudam por ação própria do usuário, e a
 * tela que os altera invalida o que precisa. Acrescentar aqui é uma decisão
 * consciente; o que este teste impede é a consulta nova ficar de fora das duas
 * listas por esquecimento.
 */
const NAO_DERIVA_DE_TRANSACAO: Record<string, string> = {
  cartoes: 'Cadastro do cartão: limite, fechamento, vencimento (§4.2).',
  categorias: 'Cadastro de categoria (§4.3).',
  config: 'Preferências e estado do app.',
  onboarding: 'Progresso do wizard, gravado em `config` (§4.1).',
  modelos: 'Lançamentos favoritos (§5.2). Mudam ao editar o modelo.',
  feriados: 'Calendário nacional, global e imutável no ano (§9.2).',
  taxas: 'CDI, Selic e IPCA vigentes, globais (§9.1).',
  fechamentos: 'Registro do ritual mensal (§8.7). A tela dele invalida.',
  'aportes-meta': 'Aportes de meta são tabela própria (§8.8): registrar não move dinheiro.',
};

function arquivos(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((nome) => {
    const caminho = join(diretorio, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/**
 * O primeiro segmento de cada `queryKey` passada a um `useQuery`.
 *
 * Só o primeiro importa: `invalidateQueries` casa por prefixo, então invalidar
 * `['faturas']` alcança `['faturas', contaId]`. E é justamente aí que mora a
 * armadilha que este teste pega — `['faturas-ponte']` PARECE alcançada por
 * `['faturas']` e não é: a comparação é elemento a elemento, e 'faturas' não é
 * 'faturas-ponte'.
 */
function chavesDeConsulta(): { chave: string; arquivo: string }[] {
  const encontradas: { chave: string; arquivo: string }[] = [];

  for (const arquivo of arquivos(FONTE)) {
    const codigo = readFileSync(arquivo, 'utf-8');

    // Uma constante local pode virar a chave: `[...CHAVE_TRANSACOES, filtros]`.
    const constantes = new Map(
      [...codigo.matchAll(/const (\w+) = \[\s*'([^']+)'/g)].map((c) => [c[1]!, c[2]!]),
    );

    for (const uso of codigo.matchAll(/useQuery\s*\(\s*\{/g)) {
      // Comentário entre a abertura e a chave é comum aqui, e uma janela curta
      // faria a consulta sumir da varredura — justamente a que mais precisa
      // ser vista, porque comentário longo costuma marcar decisão delicada.
      const depois = codigo.slice(uso.index);
      const trecho = depois.slice(0, depois.indexOf('queryFn') + 1 || 1500);

      const literal = /queryKey:\s*\[\s*(?:\.\.\.)?'([^']+)'/.exec(trecho);
      const doObjeto = /queryKey:\s*(?:\[\s*\.\.\.)?chaves\.(\w+)\./.exec(trecho);
      const daConstante = /queryKey:\s*\[\s*\.\.\.([A-Z_][A-Z0-9_]*)/.exec(trecho);

      const chave =
        literal?.[1] ??
        doObjeto?.[1] ??
        (daConstante ? constantes.get(daConstante[1]!) : undefined);

      // Consulta sem chave estática legível seria um buraco no teste, não uma
      // consulta isenta: por isso o `expect` mais abaixo confere a contagem.
      if (chave) encontradas.push({ chave, arquivo: arquivo.replace(FONTE, 'src') });
    }
  }

  return encontradas;
}

describe('invalidação de cache', () => {
  it('toda consulta está classificada: deriva de transação, ou não deriva', () => {
    const cobertas = new Set(DERIVADO_DE_TRANSACAO.map((c) => c[0]!));

    const soltas = chavesDeConsulta()
      .filter(({ chave }) => !cobertas.has(chave) && !(chave in NAO_DERIVA_DE_TRANSACAO))
      .map(({ chave, arquivo }) => `${chave} (${arquivo})`);

    expect([...new Set(soltas)]).toEqual([]);
  });

  it('nenhuma consulta escapa da varredura sem chave legível', () => {
    // Se o número cair, alguma consulta passou a montar a chave de um jeito que
    // o teste não lê — e voltaria a ser invisível, que é o defeito de origem.
    const total = readdirSync(FONTE, { recursive: true, encoding: 'utf-8' })
      .filter((n) => /\.tsx?$/.test(n))
      .reduce(
        (soma, nome) =>
          soma + [...readFileSync(join(FONTE, nome), 'utf-8').matchAll(/useQuery\s*\(\s*\{/g)].length,
        0,
      );

    expect(chavesDeConsulta().length).toBe(total);
  });

  it('a lista não repete chave nem esconde prefixo que já cobre outra', () => {
    const primeiras = DERIVADO_DE_TRANSACAO.map((c) => c[0]!);
    expect(new Set(primeiras).size).toBe(primeiras.length);
  });

  it('o primeiro segmento de `chaves` é sempre o nome do domínio', () => {
    // O teste acima resolve `chaves.contas.lista(...)` para 'contas' pelo nome
    // da propriedade. Isso só vale enquanto o objeto mantiver a convenção.
    for (const [dominio, grupo] of Object.entries(chaves)) {
      for (const valor of Object.values(grupo)) {
        const chave = typeof valor === 'function' ? valor('x' as never) : valor;
        expect(chave[0]).toBe(dominio);
      }
    }
  });
});
