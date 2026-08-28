import type { ReactNode } from 'react';
import { formatar, type Centavos } from '../dominio/dinheiro';

/**
 * Blocos visuais do app. Existem para que toda tela tenha a mesma hierarquia —
 * cabeçalho, cartão, rótulo, número — em vez de cada uma inventar a sua.
 */

export function Pagina({
  titulo,
  subtitulo,
  acao,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 pb-28 md:px-8 md:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-slate-400">{subtitulo}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </header>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function Secao({
  titulo,
  acao,
  children,
}: {
  titulo?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      {(titulo || acao) && (
        <div className="flex items-baseline justify-between">
          {titulo && (
            <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {titulo}
            </h2>
          )}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export function Cartao({
  children,
  className = '',
  aoClicar,
}: {
  children: ReactNode;
  className?: string;
  aoClicar?: () => void;
}) {
  const base =
    'rounded-xl border border-borda bg-superficie shadow-lg shadow-black/20 ' + className;
  if (aoClicar) {
    return (
      <button onClick={aoClicar} className={`${base} w-full text-left transition hover:border-borda-forte`}>
        {children}
      </button>
    );
  }
  return <div className={base}>{children}</div>;
}

type Sotaque = 'verde' | 'ambar' | 'azul' | 'roxo' | 'neutro';

const FAIXA: Record<Sotaque, string> = {
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-500',
  azul: 'bg-sky-500',
  roxo: 'bg-violet-500',
  neutro: 'bg-slate-600',
};

/**
 * Cartão de número em destaque, com faixa colorida na lateral.
 *
 * A faixa é o único uso de cor forte fora dos botões, e ela identifica o
 * indicador — não julga o valor. A exceção proposital é a conta Empresa, que
 * nunca recebe verde (§2.6).
 */
export function CartaoIndicador({
  rotulo,
  valor,
  detalhe,
  sotaque = 'neutro',
  tamanho = 'grande',
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  sotaque?: Sotaque;
  tamanho?: 'grande' | 'medio';
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-borda bg-superficie p-4 shadow-lg shadow-black/20">
      <span className={`absolute inset-y-0 left-0 w-1 ${FAIXA[sotaque]}`} />
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{rotulo}</p>
      <p
        className={`numero dinheiro mt-2 font-semibold text-slate-100 ${
          tamanho === 'grande' ? 'text-3xl' : 'text-xl'
        }`}
      >
        {valor}
      </p>
      {detalhe && <p className="mt-2 text-xs leading-relaxed text-slate-500">{detalhe}</p>}
    </div>
  );
}

/** Valor monetário. Centraliza o monoespaçado e o modo privado (§10.4). */
export function Dinheiro({
  centavos,
  className = '',
  absoluto = false,
}: {
  centavos: Centavos;
  className?: string;
  absoluto?: boolean;
}) {
  return (
    <span className={`numero dinheiro ${className}`}>
      {formatar(absoluto ? Math.abs(centavos) : centavos)}
    </span>
  );
}

export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-borda-forte px-6 py-10 text-center">
      <p className="text-slate-300">{titulo}</p>
      {descricao && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{descricao}</p>
      )}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function Botao({
  children,
  aoClicar,
  tipo = 'primario',
  desabilitado,
  submit,
  className = '',
  titulo,
}: {
  children: ReactNode;
  aoClicar?: () => void;
  tipo?: 'primario' | 'secundario' | 'discreto';
  desabilitado?: boolean;
  submit?: boolean;
  className?: string;
  titulo?: string;
}) {
  const estilos = {
    primario:
      'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-950/40',
    secundario: 'border border-borda-forte text-slate-200 hover:border-slate-500',
    discreto: 'text-slate-400 hover:text-slate-200',
  } as const;

  return (
    <button
      type={submit ? 'submit' : 'button'}
      onClick={aoClicar}
      disabled={desabilitado}
      title={titulo}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${estilos[tipo]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        ativo
          ? 'bg-emerald-600 text-white'
          : 'border border-borda-forte text-slate-300 hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  );
}

export function Campo({
  rotulo,
  ajuda,
  children,
}: {
  rotulo?: string;
  ajuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      {rotulo && <label className="mb-1.5 block text-sm text-slate-400">{rotulo}</label>}
      {children}
      {ajuda && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{ajuda}</p>}
    </div>
  );
}

export const ENTRADA =
  'w-full rounded-lg border border-borda-forte bg-superficie-alta px-3 py-2.5 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-600';

export function Etiqueta({ children, titulo }: { children: ReactNode; titulo?: string }) {
  return (
    <span
      title={titulo}
      className="rounded border border-borda-forte px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500"
    >
      {children}
    </span>
  );
}

export function Nota({
  children,
  tom = 'neutro',
}: {
  children: ReactNode;
  tom?: 'neutro' | 'atencao' | 'positivo';
}) {
  const estilos = {
    neutro: 'border-borda bg-superficie-alta/60 text-slate-400',
    atencao: 'border-amber-800/40 bg-amber-950/20 text-amber-200/90',
    positivo: 'border-emerald-800/50 bg-emerald-950/30 text-emerald-200',
  } as const;

  return (
    <p className={`rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed ${estilos[tom]}`}>
      {children}
    </p>
  );
}
