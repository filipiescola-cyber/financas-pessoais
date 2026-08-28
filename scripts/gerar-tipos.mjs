// Gera src/dados/tipos-gerados.ts a partir do schema do banco linkado.
//
// Por que não chamar o CLI direto com ">": o `supabase gen types` às vezes
// escreve uma linha de telemetria no stdout, junto do TypeScript — algo como
// {"_tag":"Error", ... "Timeout while shutting down PostHog"}. Redirecionando
// direto para o arquivo, essa linha entra no meio dos tipos e quebra o build
// com um erro que não tem nada a ver com a causa. Aqui ela é filtrada.

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const DESTINO = 'src/dados/tipos-gerados.ts';

// Comando em string única: no Windows o npx precisa de shell, e passar args
// separados junto com shell:true dispara aviso de depreciação do Node.
const resultado = spawnSync('npx supabase gen types typescript --linked', {
  encoding: 'utf8',
  shell: true,
});

if (resultado.error) {
  console.error('Falha ao executar o CLI do Supabase:', resultado.error.message);
  process.exit(1);
}

const linhas = (resultado.stdout ?? '').split('\n');
const limpas = linhas.filter((linha) => !linha.startsWith('{"_tag"'));
const conteudo = limpas.join('\n');

// Sanidade: se não vier o tipo raiz, algo deu errado e não vale sobrescrever
// um arquivo bom com lixo.
if (!conteudo.includes('export type Database')) {
  console.error('Saída inesperada do CLI. O arquivo não foi alterado.');
  console.error((resultado.stderr ?? '').trim().slice(0, 500));
  process.exit(1);
}

writeFileSync(DESTINO, conteudo, 'utf8');
console.log(`${DESTINO} atualizado (${limpas.length} linhas).`);
