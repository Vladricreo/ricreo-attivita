-- =====================================================================================================
-- Preferenze per persona, uguali in tutte le app Ricreo (per ora: la vista con cui si apre Attività).
-- Ognuno legge e scrive solo la sua riga.
-- =====================================================================================================

set lock_timeout = '5s';

create table if not exists tasks.preferenze (
  user_id uuid primary key references auth.users (id) on delete cascade,
  vista_iniziale text,
  aggiornata_at timestamptz not null default now(),
  constraint preferenze_vista_check check (vista_iniziale is null or vista_iniziale in ('lista', 'bacheca', 'calendario', 'gantt', 'dashboard'))
);
comment on table tasks.preferenze is 'Preferenze della pagina Attività per persona, valide in tutte le app. vista_iniziale null = l''ultima vista usata in quell''app.';

alter table tasks.preferenze enable row level security;

drop policy if exists preferenze_mie on tasks.preferenze;
create policy preferenze_mie on tasks.preferenze for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on tasks.preferenze from public, anon, authenticated;
grant select, insert, update, delete on tasks.preferenze to authenticated;
