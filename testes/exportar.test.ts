import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABELAS, VERSAO_DO_SCHEMA } from '../src/dados/tabelas';

/**
 * O backup precisa baixar TUDO (§10.2).
 *
 * Este teste existe porque a lista já ficou seis tabelas atrasada — dívidas,
 * aportes de meta, amortizações, ocorrências puladas, metas_investimentos e
 * fechamentos — e nada denunciou. Tabela esquecida ali não dá erro: o backup
 * é gerado, o arquivo parece completo, e a falta só aparece no restore, que é
 * quando não dá mais para consertar.
 *
 * Lê as migrations em vez de o banco: é a única fonte que sabe o schema inteiro
 * sem precisar de credencial, e roda em qualquer máquina (§13.4).
 */
const MIGRATIONS = join(__dirname, '..', 'supabase', 'migrations');

function tabelasCriadas(): string[] {
  const criadas = new Set<string>();

  for (const arquivo of readdirSync(MIGRATIONS).filter((a) => a.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, arquivo), 'utf-8');
    for (const achado of sql.matchAll(/create table (?:if not exists )?(\w+)/gi)) {
      criadas.add(achado[1]!);
    }
    // Tabela apagada por uma migration posterior não precisa entrar no backup.
    for (const achado of sql.matchAll(/drop table (?:if exists )?(\w+)/gi)) {
      criadas.delete(achado[1]!);
    }
  }

  return [...criadas].sort();
}

describe('backup completo', () => {
  it('exporta toda tabela que existe no banco', () => {
    const faltando = tabelasCriadas().filter((t) => !(TABELAS as readonly string[]).includes(t));
    expect(faltando).toEqual([]);
  });

  it('não exporta tabela que não existe', () => {
    // Nome errado na lista quebra o export inteiro, não só uma tabela.
    const criadas = tabelasCriadas();
    const sobrando = TABELAS.filter((t) => !criadas.includes(t));
    expect(sobrando).toEqual([]);
  });

  it('não repete tabela', () => {
    expect(new Set(TABELAS).size).toBe(TABELAS.length);
  });

  it('a versão do schema é a migration mais nova', () => {
    // Versão velha no arquivo de backup engana quem for restaurar.
    const ultima = readdirSync(MIGRATIONS)
      .filter((a) => a.endsWith('.sql'))
      .sort()
      .at(-1)!;

    expect(ultima.startsWith(VERSAO_DO_SCHEMA)).toBe(true);
  });
});
