-- =====================================================================================================
-- Google Tasks e Google Calendar per persona (facoltativo).
-- Ognuno collega il proprio account Google dalle Impostazioni della pagina Attività: le attività
-- assegnate a lui con una scadenza finiscono in una lista "Ricreo" di Google Tasks e/o in un calendario
-- "Ricreo attività". Solo in una direzione: app → Google.
--
-- Il consenso OAuth e il sync li fa il server di una sola app (Finance) con la secret key: token e id
-- Google stanno in tabelle senza accesso per gli utenti. Dal browser solo le funzioni qui sotto:
--   tasks.google_stato()      cosa vede la persona (mai i token);
--   tasks.google_avvia(...)   codice monouso per aprire il consenso nell'app che lo gestisce;
--   tasks.google_imposta(...) accende/spegne Tasks e Calendar;
--   tasks.google_scollega()   il server poi cancella lista e calendario su Google e revoca il token.
-- =====================================================================================================

set lock_timeout = '5s';

create table if not exists tasks.google_account (
  utente_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text,
  scope text,
  tasks_attivo boolean not null default true,
  calendar_attivo boolean not null default true,
  tasklist_id text,
  calendar_id text,
  collegato_at timestamptz,
  scollegato_at timestamptz,
  ultimo_sync_at timestamptz,
  ultimo_errore text,
  errore_at timestamptz,
  generazione integer not null default 0
);
comment on table tasks.google_account is 'Account Google collegato da una persona. refresh_token cifrato dal server. scollegato_at = da ripulire (lista/calendario su Google, revoca) e poi cancellare.';

create table if not exists tasks.google_collegamenti (
  id uuid primary key default gen_random_uuid(),
  utente_id uuid not null references auth.users (id) on delete cascade,
  ritorno text,
  tasks boolean not null default true,
  calendar boolean not null default true,
  creato_at timestamptz not null default now(),
  usato_at timestamptz,
  constraint google_collegamenti_ritorno_check check (ritorno is null or char_length(ritorno) <= 500)
);
create index if not exists google_collegamenti_utente_idx on tasks.google_collegamenti (utente_id, creato_at desc);
comment on table tasks.google_collegamenti is 'Codici monouso (10 minuti) per avviare il consenso Google per la persona che li ha chiesti.';

create table if not exists tasks.google_sync (
  utente_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  google_task_id text,
  google_event_id text,
  impronta text,
  aggiornato_at timestamptz not null default now(),
  primary key (utente_id, task_id)
);
comment on table tasks.google_sync is 'Attività già mandate su Google per persona. task_id senza FK: un''attività cancellata per sempre va tolta anche da Google.';

alter table tasks.google_account enable row level security;
alter table tasks.google_collegamenti enable row level security;
alter table tasks.google_sync enable row level security;
revoke all on tasks.google_account, tasks.google_collegamenti, tasks.google_sync from public, anon, authenticated;
grant all on tasks.google_account, tasks.google_collegamenti, tasks.google_sync to service_role;

-- Stato per la persona collegata. url_app = indirizzo dell'app che gestisce il consenso (Finance).
create or replace function tasks.google_stato()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'collegato', g.utente_id is not null and g.scollegato_at is null,
    'email', g.google_email,
    'tasks_attivo', coalesce(g.tasks_attivo, false),
    'calendar_attivo', coalesce(g.calendar_attivo, false),
    'tasks_concesso', coalesce(g.scope like '%auth/tasks%', false),
    'calendar_concesso', coalesce(g.scope like '%auth/calendar%', false),
    'collegato_at', g.collegato_at,
    'ultimo_sync_at', g.ultimo_sync_at,
    'ultimo_errore', g.ultimo_errore,
    'url_app', (select a.url from public."RicreoApp" a where a.slug = 'finance' and a."isActive")
  )
  from (select auth.uid() as me) x
  left join tasks.google_account g on g.utente_id = x.me
  where x.me is not null
$$;

-- Codice monouso per il consenso: l'app che gestisce OAuth lo legge con la secret key e sa per chi è.
create or replace function tasks.google_avvia(p_ritorno text default null, p_tasks boolean default true, p_calendar boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Serve l''accesso' using errcode = '42501';
  end if;
  if not coalesce(p_tasks, false) and not coalesce(p_calendar, false) then
    raise exception 'Scegli almeno Google Tasks o Google Calendar' using errcode = '22023';
  end if;
  if p_ritorno is not null and (char_length(p_ritorno) > 500 or p_ritorno !~ '^https?://') then
    raise exception 'Indirizzo di ritorno non valido' using errcode = '22023';
  end if;
  if (select count(*) from tasks.google_collegamenti c where c.utente_id = v_me and c.creato_at > now() - interval '1 minute') >= 5 then
    raise exception 'Troppi tentativi: riprova tra un minuto' using errcode = '22023';
  end if;
  delete from tasks.google_collegamenti c where c.utente_id = v_me and c.creato_at < now() - interval '1 day';
  insert into tasks.google_collegamenti (utente_id, ritorno, tasks, calendar)
  values (v_me, p_ritorno, coalesce(p_tasks, false), coalesce(p_calendar, false))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function tasks.google_imposta(p_tasks boolean, p_calendar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Serve l''accesso' using errcode = '42501';
  end if;
  update tasks.google_account
     set tasks_attivo = coalesce(p_tasks, tasks_attivo),
         calendar_attivo = coalesce(p_calendar, calendar_attivo)
   where utente_id = auth.uid() and scollegato_at is null;
end;
$$;

create or replace function tasks.google_scollega()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Serve l''accesso' using errcode = '42501';
  end if;
  -- Senza token non c'è niente da ripulire su Google.
  delete from tasks.google_account where utente_id = auth.uid() and refresh_token is null;
  update tasks.google_account set scollegato_at = now() where utente_id = auth.uid() and scollegato_at is null;
end;
$$;

-- Per il server: attività da tenere su Google per una persona = assegnate a lei, con scadenza, non nel
-- cestino né archiviate, aperte o chiuse da meno di 30 giorni (chiuse = spuntate su Google).
-- app_slug/url_app = app in cui aprirla (il server aggiunge il percorso della pagina Attività).
-- fatta = attività completata, o la sua parte fatta quando serve la conferma di tutti.
create or replace function tasks.google_attivita(p_utente uuid)
returns table (
  task_id uuid,
  titolo text,
  descrizione text,
  scadenza date,
  ora_scadenza time,
  fatta boolean,
  app_slug text,
  url_app text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         case when p.id is not null then p.titolo || ' › ' || t.titolo else t.titolo end,
         t.descrizione,
         t.scadenza,
         t.ora_scadenza,
         t.completata_at is not null or (t.conferma_tutti and a.fatto_at is not null),
         l.slug,
         l.url
    from tasks.assegnatari a
    join tasks.task t on t.id = a.task_id
    left join tasks.task p on p.id = t.padre_id
    left join tasks.categorie c on c.id = t.categoria_id
    -- App in cui aprirla: quella della categoria se la persona ci entra, altrimenti la prima delle sue.
    left join lateral (
      select ap.slug, ap.url
        from tasks_private.app() ap
       where ap.url is not null and tasks_private.ha_app(p_utente, ap.slug)
       order by (ap.slug = c.app_slug) desc, ap.ordine, ap.slug
       limit 1
    ) l on true
   where a.user_id = p_utente
     and t.scadenza is not null
     and t.eliminata_at is null and t.archiviata_at is null
     and (p.id is null or (p.eliminata_at is null and p.archiviata_at is null))
     and (t.completata_at is null or t.completata_at > now() - interval '30 days')
$$;

revoke all on function tasks.google_stato(), tasks.google_avvia(text, boolean, boolean), tasks.google_imposta(boolean, boolean),
  tasks.google_scollega(), tasks.google_attivita(uuid) from public, anon, authenticated;
grant execute on function tasks.google_stato(), tasks.google_avvia(text, boolean, boolean), tasks.google_imposta(boolean, boolean),
  tasks.google_scollega() to authenticated, service_role;
grant execute on function tasks.google_attivita(uuid) to service_role;
