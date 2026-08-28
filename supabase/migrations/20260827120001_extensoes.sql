-- Fase 0 — extensões necessárias.
-- pgcrypto fornece gen_random_uuid(), usado como default de toda chave primária.

create extension if not exists pgcrypto;
