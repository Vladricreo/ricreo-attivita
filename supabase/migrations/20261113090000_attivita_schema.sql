-- =====================================================================================================
-- Attività condivise tra le app Ricreo (modulo ricreo-attivita): schema `tasks`.
--
-- Una sola base per finance, inventory, print-farm, product-console e preventivatore: la stessa
-- attività si vede nella pagina Attività di ogni app in cui la persona entra.
--
-- Chi vede cosa (RLS, il codice dell'app non decide nulla):
-- - personali (personale = true): solo chi le ha create, nemmeno gli admin;
-- - le altre: chi è coinvolto (creatore, assegnatario, osservatore) in qualsiasi punto
--   dell'albero (attività + sottotask), gli admin (ruolo Admin) e i manager per le persone che
--   seguono (tasks.manager_persone, gestita dagli admin).
-- Chi vede può modificare, commentare e completare; il cestino solo creatore, admin e manager.
--
-- - categorie = app di appartenenza (badge, app dove arrivano le notifiche), sottocategorie libere;
-- - stati = colonne della bacheca, `tipo` dice cosa significano (fatto = completata);
-- - sottotask: un livello (padre_id), con `in_sequenza` sul padre si fanno una dopo l'altra e chi
--   ha la successiva riceve "tocca a te"; `conferma_tutti` = finita quando tutti hanno fatto la loro parte;
-- - ricorrenti: completarle registra lo storico e le sposta alla prossima occorrenza futura
--   (nascoste fino a scadenza - preavviso, lo decide l'interfaccia);
-- - eliminare = cestino (eliminata_at): dopo un anno tasks.da_eliminare_definitivamente() + i file;
-- - notifiche: righe per persona; app_slug = app della categoria se la persona ci ha accesso,
--   altrimenti null (compare in tutte le sue app).
--
-- Il repo del modulo è pubblico: qui solo struttura e regole, nessun dato.
-- =====================================================================================================

set lock_timeout = '5s';

create schema if not exists tasks;
create schema if not exists tasks_private;
comment on schema tasks is 'Attività condivise tra le app Ricreo (modulo ricreo-attivita). Esposto alle API.';
comment on schema tasks_private is 'Funzioni interne del modulo attività (non esposto alle API).';

revoke all on schema tasks from public, anon;
revoke all on schema tasks_private from public, anon;
grant usage on schema tasks to authenticated, service_role;
grant usage on schema tasks_private to authenticated, service_role;

-- =====================================================================================================
-- Anagrafiche
-- =====================================================================================================

create table if not exists tasks.categorie (
  id text primary key,
  nome text not null,
  app_slug text,
  colore text not null default 'slate',
  icona text,
  ordine integer not null default 0,
  attiva boolean not null default true,
  creato_at timestamptz not null default now(),
  constraint categorie_id_check check (id ~ '^[a-z0-9-]{2,40}$'),
  constraint categorie_testi_check check (char_length(btrim(nome)) between 1 and 60 and (icona is null or char_length(icona) <= 40)),
  constraint categorie_colore_check check (colore in ('slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'violet', 'fuchsia', 'pink'))
);
comment on table tasks.categorie is 'Categoria = app di appartenenza (badge). app_slug = public."RicreoApp".slug; null = di tutte (Generale).';

insert into tasks.categorie (id, nome, app_slug, colore, icona, ordine) values
  ('finance', 'Finance', 'finance', 'emerald', 'wallet', 10),
  ('inventory', 'Inventory', 'inventory', 'sky', 'boxes', 20),
  ('print-farm', 'Print farm', 'print-farm', 'orange', 'printer', 30),
  ('product-console', 'Prodotti', 'product-console', 'violet', 'package', 40),
  ('preventivatore', 'Preventivatore', 'preventivatore', 'amber', 'calculator', 50),
  ('generale', 'Generale', null, 'slate', 'building', 90)
on conflict (id) do nothing;

create table if not exists tasks.sottocategorie (
  id uuid primary key default gen_random_uuid(),
  categoria_id text not null references tasks.categorie (id) on update cascade,
  nome text not null,
  colore text,
  ordine integer not null default 0,
  archiviata_at timestamptz,
  creato_at timestamptz not null default now(),
  constraint sottocategorie_nome_check check (char_length(btrim(nome)) between 1 and 60),
  constraint sottocategorie_colore_check check (colore is null or colore in ('slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'violet', 'fuchsia', 'pink')),
  unique (categoria_id, nome)
);

insert into tasks.sottocategorie (categoria_id, nome, colore, ordine) values
  ('finance', 'Fatture', 'sky', 10),
  ('finance', 'Banca', 'emerald', 20),
  ('finance', 'Tasse e IVA', 'amber', 30),
  ('finance', 'Marketplace', 'orange', 40),
  ('finance', 'Personale', 'violet', 50),
  ('finance', 'Amministrazione', 'slate', 60),
  ('product-console', 'Miglioramento prodotti', 'violet', 10)
on conflict (categoria_id, nome) do nothing;

create table if not exists tasks.stati (
  id text primary key,
  nome text not null,
  tipo text not null,
  colore text not null default 'slate',
  ordine integer not null default 0,
  constraint stati_id_check check (id ~ '^[a-z0-9_]{2,40}$'),
  constraint stati_tipo_check check (tipo in ('aperto', 'attivo', 'revisione', 'bloccato', 'fatto')),
  constraint stati_nome_check check (char_length(btrim(nome)) between 1 and 40),
  constraint stati_colore_check check (colore in ('slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald', 'teal', 'sky', 'blue', 'indigo', 'violet', 'fuchsia', 'pink'))
);
comment on table tasks.stati is 'Colonne della bacheca. tipo: aperto (da iniziare), attivo, revisione, bloccato, fatto (= completata).';

insert into tasks.stati (id, nome, tipo, colore, ordine) values
  ('da_fare', 'Da fare', 'aperto', 'slate', 10),
  ('in_corso', 'In corso', 'attivo', 'sky', 20),
  ('in_revisione', 'Da rivedere', 'revisione', 'violet', 30),
  ('bloccata', 'Bloccata', 'bloccato', 'red', 40),
  ('fatta', 'Fatta', 'fatto', 'emerald', 90)
on conflict (id) do nothing;

-- Quali persone segue un manager (le vede e gliele assegna). Solo gli admin la modificano.
create table if not exists tasks.manager_persone (
  manager_id uuid not null references auth.users (id) on delete cascade,
  persona_id uuid not null references auth.users (id) on delete cascade,
  creato_da uuid,
  creato_at timestamptz not null default now(),
  primary key (manager_id, persona_id),
  constraint manager_persone_check check (manager_id <> persona_id)
);
create index if not exists manager_persone_persona_idx on tasks.manager_persone (persona_id);

-- =====================================================================================================
-- Attività
-- =====================================================================================================

create table if not exists tasks.task (
  id uuid primary key default gen_random_uuid(),
  radice_id uuid not null,
  padre_id uuid references tasks.task (id) on delete cascade,
  ordine double precision not null default 0,
  categoria_id text not null default 'generale' references tasks.categorie (id) on update cascade,
  sottocategoria_id uuid references tasks.sottocategorie (id) on delete set null,
  titolo text not null,
  descrizione text,
  stato_id text not null default 'da_fare' references tasks.stati (id) on update cascade,
  priorita text not null default 'normale',
  data_inizio date,
  scadenza date,
  ora_scadenza time,
  stima_minuti integer,
  ricorrenza_unita text,
  ricorrenza_intervallo integer,
  ricorrenza_fine date,
  ricorrenza_giorno smallint,
  preavviso_giorni integer,
  personale boolean not null default false,
  in_sequenza boolean not null default false,
  conferma_tutti boolean not null default false,
  copertina_id uuid,
  servizio text,
  link text,
  app_origine text,
  dati jsonb not null default '{}'::jsonb,
  legacy_id text unique,
  creato_da uuid,
  creato_at timestamptz not null default now(),
  aggiornato_at timestamptz not null default now(),
  aggiornato_da uuid,
  completata_at timestamptz,
  completata_da uuid,
  ultimo_completamento_at timestamptz,
  archiviata_at timestamptz,
  archiviata_da uuid,
  archivio_motivo text,
  automatizzata_da text,
  eliminata_at timestamptz,
  eliminata_da uuid,
  constraint task_priorita_check check (priorita in ('bassa', 'normale', 'alta', 'urgente')),
  constraint task_testi_check check (
    char_length(btrim(titolo)) between 1 and 300
    and (descrizione is null or char_length(descrizione) <= 20000)
    and (link is null or char_length(link) <= 500)
    and (servizio is null or char_length(servizio) <= 40)
    and (archivio_motivo is null or char_length(archivio_motivo) <= 500)
    and (automatizzata_da is null or char_length(automatizzata_da) <= 80)
    and (app_origine is null or char_length(app_origine) <= 40)
  ),
  constraint task_ricorrenza_check check (
    (ricorrenza_unita is null) = (ricorrenza_intervallo is null)
    and (ricorrenza_unita is null or (ricorrenza_unita in ('day', 'week', 'month', 'year') and scadenza is not null))
    and (ricorrenza_intervallo is null or ricorrenza_intervallo between 1 and 365)
    and (ricorrenza_giorno is null or ricorrenza_giorno between 1 and 31)
    and (preavviso_giorni is null or preavviso_giorni between 0 and 365)
  ),
  constraint task_date_check check (data_inizio is null or scadenza is null or data_inizio <= scadenza),
  constraint task_stima_check check (stima_minuti is null or stima_minuti between 1 and 100000),
  constraint task_padre_check check (padre_id is distinct from id),
  constraint task_dati_check check (jsonb_typeof(dati) = 'object')
);

comment on table tasks.task is 'Attività e sottotask (padre_id, un livello). radice_id = attività principale (= id per le principali).';
comment on column tasks.task.ordine is 'Posizione nella colonna della bacheca / tra le sottotask (crescente).';
comment on column tasks.task.preavviso_giorni is 'Ricorrenti: giorni prima della scadenza in cui ricompare. Null = default per unità (giorno 0, settimana 1, mese 5, anno 30).';
comment on column tasks.task.ricorrenza_giorno is 'Giorno del mese di riferimento per mensili/annuali (il 31 non scivola al 28).';
comment on column tasks.task.app_origine is 'App in cui è stata creata (slug).';
comment on column tasks.task.link is 'Pagina da aprire: percorso relativo all''app della categoria o indirizzo https.';
comment on column tasks.task.dati is 'Dati specifici di un''app (es. caratteristiche del miglioramento prodotto).';
comment on column tasks.task.legacy_id is 'Origine se importata (es. finance.tasks:<uuid>).';
comment on column tasks.task.automatizzata_da is 'Job che ora fa questa attività via API (archiviata come automatica).';

create index if not exists task_radice_idx on tasks.task (radice_id);
create index if not exists task_padre_idx on tasks.task (padre_id, ordine) where padre_id is not null;
create index if not exists task_creato_da_idx on tasks.task (creato_da);
create index if not exists task_aperte_idx on tasks.task (scadenza) where completata_at is null and archiviata_at is null and eliminata_at is null;
create index if not exists task_eliminate_idx on tasks.task (eliminata_at) where eliminata_at is not null;

create table if not exists tasks.assegnatari (
  task_id uuid not null references tasks.task (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ordine smallint not null default 0,
  assegnato_da uuid,
  assegnato_at timestamptz not null default now(),
  fatto_at timestamptz,
  primary key (task_id, user_id)
);
create index if not exists assegnatari_utente_idx on tasks.assegnatari (user_id);
comment on column tasks.assegnatari.fatto_at is 'Con conferma_tutti: quando questa persona ha fatto la sua parte.';

create table if not exists tasks.osservatori (
  task_id uuid not null references tasks.task (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  aggiunto_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists osservatori_utente_idx on tasks.osservatori (user_id);
comment on table tasks.osservatori is 'Chi segue l''attività (notifiche su commenti e stato). Creatore, assegnatari e chi commenta entrano da soli.';

create table if not exists tasks.dipendenze (
  task_id uuid not null references tasks.task (id) on delete cascade,
  dipende_da uuid not null references tasks.task (id) on delete cascade,
  creato_at timestamptz not null default now(),
  primary key (task_id, dipende_da),
  constraint dipendenze_check check (task_id <> dipende_da)
);
create index if not exists dipendenze_da_idx on tasks.dipendenze (dipende_da);
comment on table tasks.dipendenze is 'task_id può partire quando dipende_da è fatta (Gantt, "tocca a te").';

create table if not exists tasks.checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks.task (id) on delete cascade,
  testo text not null,
  ordine double precision not null default 0,
  assegnatario uuid references auth.users (id) on delete set null,
  fatta_at timestamptz,
  fatta_da uuid,
  creato_da uuid,
  creato_at timestamptz not null default now(),
  constraint checklist_testo_check check (char_length(btrim(testo)) between 1 and 500)
);
create index if not exists checklist_task_idx on tasks.checklist (task_id, ordine);

create table if not exists tasks.commenti (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks.task (id) on delete cascade,
  autore uuid,
  testo text not null default '',
  risposta_a uuid references tasks.commenti (id) on delete set null,
  menzioni uuid[] not null default '{}',
  creato_at timestamptz not null default now(),
  modificato_at timestamptz,
  eliminato_at timestamptz,
  constraint commenti_testo_check check (char_length(testo) <= 10000 and cardinality(menzioni) <= 50)
);
create index if not exists commenti_task_idx on tasks.commenti (task_id, creato_at);

create table if not exists tasks.reazioni (
  commento_id uuid not null references tasks.commenti (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  creato_at timestamptz not null default now(),
  primary key (commento_id, user_id, emoji),
  constraint reazioni_emoji_check check (char_length(emoji) between 1 and 16)
);

create table if not exists tasks.allegati (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks.task (id) on delete cascade,
  commento_id uuid references tasks.commenti (id) on delete set null,
  percorso text not null unique,
  nome text not null,
  tipo_mime text,
  dimensione bigint,
  larghezza integer,
  altezza integer,
  caricato_da uuid,
  caricato_at timestamptz not null default now(),
  eliminato_at timestamptz,
  constraint allegati_testi_check check (char_length(percorso) <= 500 and char_length(nome) between 1 and 255 and (tipo_mime is null or char_length(tipo_mime) <= 120))
);
create index if not exists allegati_task_idx on tasks.allegati (task_id, caricato_at);
create index if not exists allegati_commento_idx on tasks.allegati (commento_id) where commento_id is not null;
comment on table tasks.allegati is 'File nel bucket privato `tasks`, percorso <task_id>/<uuid>-<nome>.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'task_copertina_fkey') then
    alter table tasks.task add constraint task_copertina_fkey
      foreign key (copertina_id) references tasks.allegati (id) on delete set null;
  end if;
end $$;

create table if not exists tasks.collegamenti (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks.task (id) on delete cascade,
  app_slug text not null,
  tipo text not null,
  rif_id text,
  etichetta text,
  url text,
  creato_da uuid,
  creato_at timestamptz not null default now(),
  constraint collegamenti_testi_check check (
    char_length(app_slug) <= 40 and char_length(tipo) <= 60 and (rif_id is null or char_length(rif_id) <= 200)
    and (etichetta is null or char_length(etichetta) <= 200) and (url is null or char_length(url) <= 500)
  )
);
create unique index if not exists collegamenti_unico_idx on tasks.collegamenti (task_id, app_slug, tipo, coalesce(rif_id, ''));
create index if not exists collegamenti_rif_idx on tasks.collegamenti (app_slug, tipo, rif_id);
comment on table tasks.collegamenti is 'Oggetti delle app legati all''attività (es. finance/nota, product-console/prodotto).';

create table if not exists tasks.storico (
  id bigint generated always as identity primary key,
  task_id uuid not null references tasks.task (id) on delete cascade,
  attore uuid,
  azione text not null,
  dettagli jsonb not null default '{}'::jsonb,
  creato_at timestamptz not null default now()
);
create index if not exists storico_task_idx on tasks.storico (task_id, creato_at desc);

create table if not exists tasks.completamenti (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks.task (id) on delete cascade,
  scadenza date,
  completata_at timestamptz not null default now(),
  completata_da uuid
);
create index if not exists completamenti_task_idx on tasks.completamenti (task_id, completata_at desc);
create index if not exists completamenti_data_idx on tasks.completamenti (completata_at desc);
comment on table tasks.completamenti is 'Ogni completamento (le ricorrenti ne hanno uno per occorrenza): storico e dashboard.';

create table if not exists tasks.letture (
  task_id uuid not null references tasks.task (id) on delete cascade,
  user_id uuid not null,
  letto_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table if not exists tasks.notifiche (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null,
  task_id uuid references tasks.task (id) on delete cascade,
  commento_id uuid references tasks.commenti (id) on delete set null,
  attore uuid,
  app_slug text,
  titolo text,
  testo text,
  conteggio integer not null default 1,
  creata_at timestamptz not null default now(),
  aggiornata_at timestamptz not null default now(),
  letta_at timestamptz,
  archiviata_at timestamptz,
  push_inviata_at timestamptz,
  constraint notifiche_tipo_check check (tipo in ('assegnata', 'menzione', 'commento', 'completata', 'stato', 'tocca_a_te', 'sottotask_finite', 'scadenza', 'riaperta')),
  constraint notifiche_testi_check check ((titolo is null or char_length(titolo) <= 300) and (testo is null or char_length(testo) <= 500))
);
create index if not exists notifiche_utente_idx on tasks.notifiche (user_id, creata_at desc);
create index if not exists notifiche_non_lette_idx on tasks.notifiche (user_id, task_id, tipo) where letta_at is null;
comment on table tasks.notifiche is 'Notifiche delle attività per persona. app_slug: app della categoria se la persona ci ha accesso, null = tutte le sue app. Il testo lo compone l''interfaccia da tipo + attore.';

-- =====================================================================================================
-- Funzioni di supporto (tasks_private: security definer, fuori dalle API)
-- =====================================================================================================

-- Chi agisce: utente della sessione, o tasks.attore impostato da un job con la secret key.
create or replace function tasks_private.attore()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.uid(), nullif(current_setting('tasks.attore', true), '')::uuid)
$$;

create or replace function tasks_private.oggi()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Rome')::date
$$;

create or replace function tasks_private.e_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_auth.has_role('Admin'), false)
$$;

create or replace function tasks_private.e_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app_auth.has_role('Manager'), false)
$$;

-- Attività principali visibili all'utente della sessione (vedi intestazione).
create or replace function tasks_private.radici_visibili()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid, coalesce(app_auth.has_role('Admin'), false) as admin
  ),
  seguiti as (
    select mp.persona_id from tasks.manager_persone mp, me where mp.manager_id = me.uid
  )
  select t.radice_id
  from tasks.task t, me
  where me.uid is not null
    and not t.personale
    and (
      me.admin
      or t.creato_da = me.uid
      or t.creato_da in (select persona_id from seguiti)
      or exists (
        select 1 from tasks.assegnatari a
        where a.task_id = t.id and (a.user_id = me.uid or a.user_id in (select persona_id from seguiti))
      )
      or exists (select 1 from tasks.osservatori o where o.task_id = t.id and o.user_id = me.uid)
    )
  union
  select t.id
  from tasks.task t, me
  where t.personale and t.padre_id is null and t.creato_da = me.uid
$$;

create or replace function tasks_private.task_visibili()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from tasks.task t
  where t.creato_da = auth.uid()
     or t.radice_id in (select tasks_private.radici_visibili())
$$;

create or replace function tasks_private.puo_vedere(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tasks.task t
    where t.id = p_task
      and (t.creato_da = auth.uid() or t.radice_id in (select tasks_private.radici_visibili()))
  )
$$;

-- Cestino: chi l'ha creata, un admin, un manager (che la vede).
create or replace function tasks_private.puo_eliminare(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tasks.task t
    where t.id = p_task
      and (
        t.creato_da = auth.uid()
        or (select app_auth.has_role('Admin'))
        or ((select app_auth.has_role('Manager')) and tasks_private.puo_vedere(t.id))
      )
  )
$$;

-- La persona entra in quell'app? (accessi gestiti da Inventory → Impostazioni → Accessi alle app)
create or replace function tasks_private.ha_app(p_user uuid, p_app text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_app is null or exists (
    select 1
    from public."User" u
    join public."RicreoAppAccess" x on x."userId" = u.id
    join public."RicreoApp" a on a.id = x."appId"
    where u."authUserId" = p_user and a.slug = p_app and a."isActive"
  )
$$;

-- Prossima occorrenza dopo p_data (mesi/anni: stesso giorno di riferimento, al massimo l'ultimo del mese).
create or replace function tasks_private.prossima_data(p_data date, p_unita text, p_n integer, p_giorno smallint)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_unita
    when 'day' then p_data + p_n
    when 'week' then p_data + 7 * p_n
    else (
      with m as (
        select date_trunc('month', p_data + case when p_unita = 'year' then make_interval(years => p_n)
                                                 else make_interval(months => p_n) end)::date as inizio
      )
      select inizio + (least(coalesce(p_giorno, extract(day from p_data)::smallint),
                             extract(day from (inizio + interval '1 month' - interval '1 day'))::int) - 1)
      from m
    )
  end
$$;

-- Prima occorrenza dopo oggi (quelle saltate non si recuperano).
create or replace function tasks_private.prossima_futura(p_data date, p_unita text, p_n integer, p_giorno smallint)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_next date := p_data;
  v_oggi date := tasks_private.oggi();
  v_giri integer := 0;
begin
  loop
    v_next := tasks_private.prossima_data(v_next, p_unita, p_n, p_giorno);
    v_giri := v_giri + 1;
    exit when v_next > v_oggi or v_giri > 5000;
  end loop;
  return v_next;
end;
$$;

create or replace function tasks_private.tipo_stato(p_stato text)
returns text
language sql
stable
set search_path = ''
as $$
  select tipo from tasks.stati where id = p_stato
$$;

create or replace function tasks_private.primo_stato_aperto()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select id from tasks.stati where tipo = 'aperto' order by ordine, id limit 1), 'da_fare')
$$;

-- Trigger a cascata (riapertura delle sottotask di una ricorrente, annullo): niente storico/notifiche.
create or replace function tasks_private.silenzioso()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('tasks.silenzioso', true), '') = 'on'
$$;

create or replace function tasks_private.scrivi_storico(p_task uuid, p_azione text, p_dettagli jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into tasks.storico (task_id, attore, azione, dettagli)
  select p_task, tasks_private.attore(), p_azione, coalesce(p_dettagli, '{}'::jsonb)
  where not tasks_private.silenzioso()
$$;

-- Notifica a più persone (mai a chi agisce). p_aggrega: se c'è già una non letta dello stesso tipo
-- sulla stessa attività (es. commenti di una chat), la aggiorna e aumenta il conteggio.
create or replace function tasks_private.notifica(
  p_utenti uuid[],
  p_tipo text,
  p_task uuid,
  p_testo text default null,
  p_commento uuid default null,
  p_aggrega boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attore uuid := tasks_private.attore();
  v_app text;
  v_titolo text;
  v_personale boolean;
  v_creatore uuid;
  v_utenti uuid[];
  u uuid;
begin
  if tasks_private.silenzioso() then
    return;
  end if;
  select c.app_slug, t.titolo, t.personale, t.creato_da into v_app, v_titolo, v_personale, v_creatore
  from tasks.task t
  join tasks.categorie c on c.id = t.categoria_id
  where t.id = p_task;
  if not found then
    return;
  end if;
  select array_agg(distinct x) into v_utenti
  from unnest(p_utenti) x
  where x is not null and x is distinct from v_attore and (not v_personale or x = v_creatore);
  if v_utenti is null then
    return;
  end if;
  foreach u in array v_utenti loop
    if p_aggrega then
      update tasks.notifiche
         set conteggio = conteggio + 1, testo = left(p_testo, 500), titolo = left(v_titolo, 300), attore = v_attore,
             commento_id = p_commento, aggiornata_at = now(), push_inviata_at = null
       where user_id = u and task_id = p_task and tipo = p_tipo and letta_at is null and archiviata_at is null;
      if found then
        continue;
      end if;
    end if;
    insert into tasks.notifiche (user_id, tipo, task_id, commento_id, attore, app_slug, titolo, testo)
    values (u, p_tipo, p_task, p_commento, v_attore,
            case when v_app is not null and tasks_private.ha_app(u, v_app) then v_app end,
            left(v_titolo, 300), left(p_testo, 500));
  end loop;
end;
$$;

-- Persone delle app (per assegnare, avatar, ruoli e app a cui accedono).
create or replace function tasks_private.persone()
returns table (
  auth_id uuid,
  user_id integer,
  nome text,
  username text,
  email text,
  avatar_path text,
  ruoli text[],
  app text[],
  attivo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select u."authUserId",
         u.id,
         coalesce(nullif(btrim(u.name), ''), u.username),
         u.username,
         u.email,
         nullif(regexp_replace(split_part(p."avatarUrl", '?', 1), '^/files/', ''), ''),
         coalesce((select array_agg(r.name order by r.name)
                   from public."UserRole" ur join public."Role" r on r.id = ur."roleId"
                   where ur."userId" = u.id), '{}'::text[]),
         coalesce((select array_agg(a.slug order by a."sortOrder", a.slug)
                   from public."RicreoAppAccess" x join public."RicreoApp" a on a.id = x."appId" and a."isActive"
                   where x."userId" = u.id), '{}'::text[]),
         u."isActive"
  from public."User" u
  left join public."Profile" p on p."userId" = u.id
  where u."authUserId" is not null
    and ((select auth.role()) = 'service_role' or (select auth.uid()) is not null)
$$;

-- App Ricreo attive (per i link verso l'app di un'altra categoria).
create or replace function tasks_private.app()
returns table (slug text, nome text, url text, logo_url text, ordine integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.slug, a.name, a.url, a."logoUrl", a."sortOrder"
  from public."RicreoApp" a
  where a."isActive" and ((select auth.role()) = 'service_role' or (select auth.uid()) is not null)
$$;

-- Primo segmento del percorso di un allegato = id dell'attività.
create or replace function tasks_private.task_da_percorso(p_nome text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_nome, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nome, '/', 1)::uuid end
$$;

-- =====================================================================================================
-- Trigger: attività
-- =====================================================================================================

create or replace function tasks_private.task_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_attore uuid := tasks_private.attore();
  v_padre tasks.task%rowtype;
  v_tipo_new text;
  v_tipo_old text;
  v_prossima date;
  v_salto boolean := false;
begin
  if tg_op = 'INSERT' then
    -- Dalla sessione di un utente autore e date li decide il database; job e import (secret key) li possono passare.
    if v_uid is not null then
      new.creato_da := v_uid;
      new.creato_at := now();
      new.completata_at := null;
      new.completata_da := null;
      new.ultimo_completamento_at := null;
      new.archiviata_at := null;
      new.archiviata_da := null;
      new.eliminata_at := null;
      new.eliminata_da := null;
      new.legacy_id := null;
      new.copertina_id := null;
    else
      new.creato_da := coalesce(new.creato_da, v_attore);
    end if;
    new.aggiornato_at := now();
    new.aggiornato_da := coalesce(v_attore, new.creato_da);

    if new.padre_id is not null then
      select * into v_padre from tasks.task where id = new.padre_id;
      if not found then
        raise exception 'L''attività principale non esiste più: ricarica la pagina.' using errcode = '23503';
      end if;
      if v_padre.padre_id is not null then
        raise exception 'Una sottotask non può avere a sua volta sottotask.' using errcode = '22023';
      end if;
      if v_uid is not null and not tasks_private.puo_vedere(v_padre.id) then
        raise exception 'Non hai accesso a questa attività.' using errcode = '42501';
      end if;
      new.radice_id := v_padre.id;
      new.personale := v_padre.personale;
      new.ricorrenza_unita := null;
      new.ricorrenza_intervallo := null;
      new.ricorrenza_fine := null;
      new.preavviso_giorni := null;
    else
      new.radice_id := new.id;
    end if;
  else
    new.id := old.id;
    new.creato_da := old.creato_da;
    new.creato_at := old.creato_at;
    new.legacy_id := old.legacy_id;
    new.padre_id := old.padre_id;
    new.radice_id := old.radice_id;
    new.aggiornato_at := now();
    new.aggiornato_da := coalesce(v_attore, old.aggiornato_da);

    if new.padre_id is not null then
      new.personale := (select personale from tasks.task where id = new.padre_id);
      new.ricorrenza_unita := null;
      new.ricorrenza_intervallo := null;
      new.ricorrenza_fine := null;
      new.preavviso_giorni := null;
    elsif new.personale is distinct from old.personale and v_uid is not null and v_uid is distinct from old.creato_da then
      raise exception 'Solo chi l''ha creata può renderla personale o condivisa.' using errcode = '42501';
    end if;

    if new.eliminata_at is distinct from old.eliminata_at then
      if v_uid is not null and not tasks_private.puo_eliminare(old.id) then
        raise exception 'Solo chi l''ha creata, un admin o un manager può eliminarla.' using errcode = '42501';
      end if;
      if new.eliminata_at is not null then
        new.eliminata_at := now();
        new.eliminata_da := v_attore;
      else
        new.eliminata_da := null;
      end if;
    else
      new.eliminata_da := old.eliminata_da;
    end if;

    if new.archiviata_at is distinct from old.archiviata_at then
      if new.archiviata_at is not null then
        new.archiviata_at := case when v_uid is null then new.archiviata_at else now() end;
        new.archiviata_da := v_attore;
      else
        new.archiviata_da := null;
        new.archivio_motivo := null;
        new.automatizzata_da := null;
      end if;
    else
      new.archiviata_da := old.archiviata_da;
    end if;

    -- Il completamento lo gestisce solo questo trigger (o l'annullo, in modalità silenziosa).
    if not tasks_private.silenzioso() then
      new.ultimo_completamento_at := old.ultimo_completamento_at;
      new.completata_at := old.completata_at;
      new.completata_da := old.completata_da;
    end if;

    if new.copertina_id is distinct from old.copertina_id and new.copertina_id is not null
       and not exists (select 1 from tasks.allegati a where a.id = new.copertina_id and a.task_id = old.id) then
      raise exception 'La copertina deve essere un allegato di questa attività.' using errcode = '22023';
    end if;
  end if;

  -- Completamento ---------------------------------------------------------------------------------
  v_tipo_new := tasks_private.tipo_stato(new.stato_id);
  if tg_op = 'UPDATE' then
    v_tipo_old := tasks_private.tipo_stato(old.stato_id);
  end if;

  if not tasks_private.silenzioso() then
    if v_tipo_new = 'fatto' and (tg_op = 'INSERT' or v_tipo_old is distinct from 'fatto') then
      new.ultimo_completamento_at := now();
      if new.ricorrenza_unita is not null and new.scadenza is not null and new.padre_id is null then
        if new.ricorrenza_giorno is null and new.ricorrenza_unita in ('month', 'year') then
          new.ricorrenza_giorno := extract(day from new.scadenza)::smallint;
        end if;
        v_prossima := tasks_private.prossima_futura(new.scadenza, new.ricorrenza_unita, new.ricorrenza_intervallo, new.ricorrenza_giorno);
        if new.ricorrenza_fine is null or v_prossima <= new.ricorrenza_fine then
          if new.data_inizio is not null then
            new.data_inizio := new.data_inizio + (v_prossima - new.scadenza);
          end if;
          new.scadenza := v_prossima;
          new.stato_id := tasks_private.primo_stato_aperto();
          new.completata_at := null;
          new.completata_da := null;
          v_salto := true;
        else
          new.completata_at := now();
          new.completata_da := v_attore;
        end if;
      else
        new.completata_at := now();
        new.completata_da := v_attore;
      end if;
    elsif tg_op = 'UPDATE' and v_tipo_new is distinct from 'fatto' and v_tipo_old = 'fatto' then
      new.completata_at := null;
      new.completata_da := null;
    end if;
  end if;

  -- Giorno di riferimento delle ricorrenze mensili/annuali: si ricalcola quando la scadenza la cambia una persona.
  if new.ricorrenza_unita in ('month', 'year') and new.scadenza is not null then
    if new.ricorrenza_giorno is null
       or (tg_op = 'UPDATE' and not v_salto and not tasks_private.silenzioso() and new.scadenza is distinct from old.scadenza) then
      new.ricorrenza_giorno := extract(day from new.scadenza)::smallint;
    end if;
  else
    new.ricorrenza_giorno := null;
  end if;

  new.titolo := btrim(new.titolo);
  return new;
end;
$$;

drop trigger if exists trg_task_prima on tasks.task;
create trigger trg_task_prima
  before insert or update on tasks.task
  for each row execute function tasks_private.task_prima();

create or replace function tasks_private.task_dopo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attore uuid := tasks_private.attore();
  v_tipo_new text := tasks_private.tipo_stato(new.stato_id);
  v_tipo_old text;
  v_padre tasks.task%rowtype;
  v_next tasks.task%rowtype;
  v_destinatari uuid[];
  r record;
begin
  if tg_op = 'INSERT' then
    if new.creato_da is not null then
      insert into tasks.osservatori (task_id, user_id) values (new.id, new.creato_da) on conflict do nothing;
    end if;
    perform tasks_private.scrivi_storico(new.id, 'creata', jsonb_build_object('app', new.app_origine));
    if new.padre_id is not null then
      perform tasks_private.scrivi_storico(new.padre_id, 'sottotask', jsonb_build_object('id', new.id, 'titolo', new.titolo));
    end if;
    if new.ultimo_completamento_at is not null and not tasks_private.silenzioso() then
      insert into tasks.completamenti (task_id, scadenza, completata_at, completata_da)
      values (new.id, new.scadenza, new.ultimo_completamento_at, v_attore);
    end if;
    return null;
  end if;

  v_tipo_old := tasks_private.tipo_stato(old.stato_id);

  -- Storico dei campi principali.
  if not tasks_private.silenzioso() then
    if new.titolo is distinct from old.titolo then
      perform tasks_private.scrivi_storico(new.id, 'campo', jsonb_build_object('campo', 'titolo', 'prima', old.titolo, 'dopo', new.titolo));
    end if;
    if new.descrizione is distinct from old.descrizione then
      perform tasks_private.scrivi_storico(new.id, 'campo', jsonb_build_object('campo', 'descrizione'));
    end if;
    if new.stato_id is distinct from old.stato_id and new.ultimo_completamento_at is not distinct from old.ultimo_completamento_at then
      perform tasks_private.scrivi_storico(new.id, 'stato', jsonb_build_object('prima', old.stato_id, 'dopo', new.stato_id));
    end if;
    if new.priorita is distinct from old.priorita then
      perform tasks_private.scrivi_storico(new.id, 'campo', jsonb_build_object('campo', 'priorita', 'prima', old.priorita, 'dopo', new.priorita));
    end if;
    if (new.scadenza is distinct from old.scadenza or new.data_inizio is distinct from old.data_inizio)
       and new.ultimo_completamento_at is not distinct from old.ultimo_completamento_at then
      perform tasks_private.scrivi_storico(new.id, 'date', jsonb_build_object(
        'inizio_prima', old.data_inizio, 'inizio_dopo', new.data_inizio, 'prima', old.scadenza, 'dopo', new.scadenza));
    end if;
    if new.categoria_id is distinct from old.categoria_id or new.sottocategoria_id is distinct from old.sottocategoria_id then
      perform tasks_private.scrivi_storico(new.id, 'categoria', jsonb_build_object(
        'prima', old.categoria_id, 'dopo', new.categoria_id, 'sotto_prima', old.sottocategoria_id, 'sotto_dopo', new.sottocategoria_id));
    end if;
    if new.personale is distinct from old.personale and new.padre_id is null then
      perform tasks_private.scrivi_storico(new.id, case when new.personale then 'personale' else 'condivisa' end);
    end if;
    if new.archiviata_at is distinct from old.archiviata_at then
      perform tasks_private.scrivi_storico(new.id, case when new.archiviata_at is null then 'ripristinata' else 'archiviata' end,
        jsonb_build_object('motivo', new.archivio_motivo));
    end if;
    if new.eliminata_at is distinct from old.eliminata_at then
      perform tasks_private.scrivi_storico(new.id, case when new.eliminata_at is null then 'recuperata' else 'eliminata' end);
    end if;
  end if;

  -- Le sottotask seguono la principale (personale).
  if new.padre_id is null and new.personale is distinct from old.personale then
    update tasks.task set personale = new.personale where padre_id = new.id;
  end if;

  -- Completata (anche un giro di una ricorrente) ---------------------------------------------------
  if new.ultimo_completamento_at is distinct from old.ultimo_completamento_at and new.ultimo_completamento_at is not null
     and not tasks_private.silenzioso() then
    insert into tasks.completamenti (task_id, scadenza, completata_at, completata_da)
    values (new.id, old.scadenza, new.ultimo_completamento_at, v_attore);
    perform tasks_private.scrivi_storico(new.id, 'completata', jsonb_build_object(
      'scadenza', old.scadenza, 'prossima', case when new.completata_at is null then new.scadenza end));

    -- Chi la segue (creatore e osservatori) sa che è fatta.
    select array_agg(o.user_id) into v_destinatari from tasks.osservatori o where o.task_id = new.id;
    perform tasks_private.notifica(v_destinatari, 'completata', new.id,
      case when new.completata_at is null then 'Prossima scadenza ' || to_char(new.scadenza, 'DD/MM/YYYY') end);

    -- Ricorrente: al nuovo giro sottotask, checklist e parti si riaprono.
    if new.completata_at is null and new.padre_id is null then
      perform set_config('tasks.silenzioso', 'on', true);
      update tasks.task s set stato_id = new.stato_id, completata_at = null, completata_da = null
       where s.padre_id = new.id and tasks_private.tipo_stato(s.stato_id) = 'fatto';
      update tasks.checklist c set fatta_at = null, fatta_da = null
       where c.fatta_at is not null and (c.task_id = new.id or c.task_id in (select id from tasks.task where padre_id = new.id));
      update tasks.assegnatari a set fatto_at = null
       where a.fatto_at is not null and (a.task_id = new.id or a.task_id in (select id from tasks.task where padre_id = new.id));
      perform set_config('tasks.silenzioso', 'off', true);
    end if;

    -- Sottotask: tocca al passo successivo (in sequenza), avviso quando sono tutte fatte.
    if new.padre_id is not null then
      select * into v_padre from tasks.task where id = new.padre_id;
      if v_padre.in_sequenza then
        select * into v_next from tasks.task s
         where s.padre_id = new.padre_id and s.id <> new.id and s.eliminata_at is null
           and tasks_private.tipo_stato(s.stato_id) <> 'fatto'
         order by s.ordine, s.creato_at
         limit 1;
        if v_next.id is not null and v_next.ordine > new.ordine then
          select array_agg(a.user_id) into v_destinatari from tasks.assegnatari a where a.task_id = v_next.id;
          perform tasks_private.notifica(v_destinatari, 'tocca_a_te', v_next.id, 'Dopo: ' || new.titolo);
        end if;
      end if;
      if not exists (
        select 1 from tasks.task s
        where s.padre_id = new.padre_id and s.eliminata_at is null and tasks_private.tipo_stato(s.stato_id) <> 'fatto'
      ) then
        select array_agg(distinct x) into v_destinatari from (
          select v_padre.creato_da as x
          union all select a.user_id from tasks.assegnatari a where a.task_id = v_padre.id
        ) q;
        perform tasks_private.notifica(v_destinatari, 'sottotask_finite', v_padre.id, null);
      end if;
    end if;

    -- Dipendenze: chi aspettava questa e ora non aspetta più nulla.
    for r in
      select d.task_id from tasks.dipendenze d
      where d.dipende_da = new.id
        and not exists (
          select 1 from tasks.dipendenze d2 join tasks.task t2 on t2.id = d2.dipende_da
          where d2.task_id = d.task_id and t2.completata_at is null and t2.eliminata_at is null and t2.id <> new.id
        )
    loop
      select array_agg(a.user_id) into v_destinatari from tasks.assegnatari a where a.task_id = r.task_id;
      perform tasks_private.notifica(v_destinatari, 'tocca_a_te', r.task_id, 'Dopo: ' || new.titolo);
    end loop;
  end if;

  -- Riaperta / cambio di stato verso revisione o bloccata: lo sa chi l'ha creata.
  if not tasks_private.silenzioso() and new.stato_id is distinct from old.stato_id
     and new.ultimo_completamento_at is not distinct from old.ultimo_completamento_at then
    if v_tipo_old = 'fatto' and v_tipo_new <> 'fatto' then
      select array_agg(a.user_id) into v_destinatari from tasks.assegnatari a where a.task_id = new.id;
      perform tasks_private.notifica(v_destinatari || new.creato_da, 'riaperta', new.id, null);
    elsif v_tipo_new in ('revisione', 'bloccato') then
      perform tasks_private.notifica(array[new.creato_da], 'stato', new.id, new.stato_id);
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_task_dopo on tasks.task;
create trigger trg_task_dopo
  after insert or update on tasks.task
  for each row execute function tasks_private.task_dopo();

-- =====================================================================================================
-- Trigger: assegnatari, osservatori, checklist, commenti, allegati
-- =====================================================================================================

create or replace function tasks_private.assegnatari_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task tasks.task%rowtype;
begin
  select * into v_task from tasks.task where id = new.task_id;
  if tg_op = 'INSERT' then
    if v_task.personale and new.user_id is distinct from v_task.creato_da then
      raise exception 'Le attività personali non si assegnano ad altri.' using errcode = '22023';
    end if;
    -- Import e job (secret key) possono passare chi/quando; dalla sessione decide il database.
    if auth.uid() is not null then
      if not exists (select 1 from public."User" u where u."authUserId" = new.user_id and u."isActive") then
        raise exception 'Persona non attiva.' using errcode = '22023';
      end if;
      new.assegnato_da := auth.uid();
      new.assegnato_at := now();
      new.fatto_at := null;
    else
      new.assegnato_da := coalesce(new.assegnato_da, tasks_private.attore());
    end if;
  else
    new.task_id := old.task_id;
    new.user_id := old.user_id;
    new.assegnato_da := old.assegnato_da;
    new.assegnato_at := old.assegnato_at;
    if new.fatto_at is distinct from old.fatto_at and new.fatto_at is not null then
      if auth.uid() is not null and auth.uid() <> old.user_id and not tasks_private.e_admin() then
        raise exception 'Puoi segnare solo la tua parte.' using errcode = '42501';
      end if;
      new.fatto_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assegnatari_prima on tasks.assegnatari;
create trigger trg_assegnatari_prima
  before insert or update on tasks.assegnatari
  for each row execute function tasks_private.assegnatari_prima();

create or replace function tasks_private.assegnatari_dopo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task tasks.task%rowtype;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from tasks.task where id = old.task_id) then
      perform tasks_private.scrivi_storico(old.task_id, 'tolta', jsonb_build_object('persona', old.user_id));
    end if;
    return null;
  end if;

  select * into v_task from tasks.task where id = new.task_id;

  if tg_op = 'INSERT' then
    insert into tasks.osservatori (task_id, user_id) values (new.task_id, new.user_id) on conflict do nothing;
    perform tasks_private.scrivi_storico(new.task_id, 'assegnata', jsonb_build_object('persona', new.user_id));
    if v_task.completata_at is null and v_task.eliminata_at is null and v_task.archiviata_at is null then
      perform tasks_private.notifica(array[new.user_id], 'assegnata', new.task_id, null);
    end if;
    return null;
  end if;

  -- conferma_tutti: quando l'ultima persona fa la sua parte l'attività è fatta.
  if new.fatto_at is not null and old.fatto_at is null then
    perform tasks_private.scrivi_storico(new.task_id, 'parte_fatta', jsonb_build_object('persona', new.user_id));
    if v_task.conferma_tutti and v_task.completata_at is null
       and not exists (select 1 from tasks.assegnatari a where a.task_id = new.task_id and a.fatto_at is null) then
      update tasks.task set stato_id = (select id from tasks.stati where tipo = 'fatto' order by ordine limit 1)
       where id = new.task_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_assegnatari_dopo on tasks.assegnatari;
create trigger trg_assegnatari_dopo
  after insert or update or delete on tasks.assegnatari
  for each row execute function tasks_private.assegnatari_dopo();

create or replace function tasks_private.checklist_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.creato_da := tasks_private.attore();
    new.creato_at := now();
    new.fatta_da := case when new.fatta_at is not null then tasks_private.attore() end;
    new.fatta_at := case when new.fatta_at is not null then now() end;
  else
    new.task_id := old.task_id;
    new.creato_da := old.creato_da;
    new.creato_at := old.creato_at;
    if new.fatta_at is distinct from old.fatta_at and not tasks_private.silenzioso() then
      new.fatta_da := case when new.fatta_at is not null then tasks_private.attore() end;
      new.fatta_at := case when new.fatta_at is not null then now() end;
    end if;
  end if;
  new.testo := btrim(new.testo);
  return new;
end;
$$;

drop trigger if exists trg_checklist_prima on tasks.checklist;
create trigger trg_checklist_prima
  before insert or update on tasks.checklist
  for each row execute function tasks_private.checklist_prima();

create or replace function tasks_private.commenti_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo persone attive tra le menzioni, senza doppioni.
  new.menzioni := coalesce((
    select array_agg(distinct m)
    from unnest(new.menzioni) m
    where exists (select 1 from public."User" u where u."authUserId" = m and u."isActive")
  ), '{}'::uuid[]);

  if tg_op = 'INSERT' then
    new.autore := coalesce(auth.uid(), new.autore, tasks_private.attore());
    if auth.uid() is not null then
      new.creato_at := now();
      new.modificato_at := null;
      new.eliminato_at := null;
    end if;
    if new.risposta_a is not null
       and not exists (select 1 from tasks.commenti c where c.id = new.risposta_a and c.task_id = new.task_id) then
      new.risposta_a := null;
    end if;
  else
    new.id := old.id;
    new.task_id := old.task_id;
    new.autore := old.autore;
    new.creato_at := old.creato_at;
    new.risposta_a := old.risposta_a;
    if new.testo is distinct from old.testo then
      new.modificato_at := now();
    end if;
    if new.eliminato_at is distinct from old.eliminato_at then
      new.eliminato_at := case when new.eliminato_at is not null then now() end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_commenti_prima on tasks.commenti;
create trigger trg_commenti_prima
  before insert or update on tasks.commenti
  for each row execute function tasks_private.commenti_prima();

create or replace function tasks_private.commenti_dopo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_altri uuid[];
  v_estratto text := left(regexp_replace(new.testo, '\s+', ' ', 'g'), 200);
  v_nuove uuid[];
begin
  if tg_op = 'INSERT' then
    if new.autore is not null then
      insert into tasks.osservatori (task_id, user_id) values (new.task_id, new.autore) on conflict do nothing;
      insert into tasks.letture (task_id, user_id, letto_at) values (new.task_id, new.autore, now())
      on conflict (task_id, user_id) do update set letto_at = excluded.letto_at;
    end if;
    v_nuove := new.menzioni;
  else
    if new.eliminato_at is not null then
      return null;
    end if;
    -- Menzioni aggiunte modificando il messaggio.
    select array_agg(m) into v_nuove from unnest(new.menzioni) m where not (m = any (old.menzioni));
  end if;

  if v_nuove is not null and cardinality(v_nuove) > 0 then
    insert into tasks.osservatori (task_id, user_id)
    select new.task_id, m from unnest(v_nuove) m
    on conflict do nothing;
    perform tasks_private.notifica(v_nuove, 'menzione', new.task_id, v_estratto, new.id);
  end if;

  if tg_op = 'INSERT' then
    select array_agg(distinct x) into v_altri from (
      select o.user_id as x from tasks.osservatori o where o.task_id = new.task_id
      union
      select a.user_id from tasks.assegnatari a where a.task_id = new.task_id
    ) q
    where not (x = any (new.menzioni));
    if (select personale from tasks.task where id = new.task_id) is not true then
      perform tasks_private.notifica(v_altri, 'commento', new.task_id,
        case when v_estratto = '' then 'Ha mandato un allegato' else v_estratto end, new.id, true);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_commenti_dopo on tasks.commenti;
create trigger trg_commenti_dopo
  after insert or update on tasks.commenti
  for each row execute function tasks_private.commenti_dopo();

create or replace function tasks_private.allegati_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if tasks_private.task_da_percorso(new.percorso) is distinct from new.task_id then
      raise exception 'Percorso dell''allegato non valido.' using errcode = '22023';
    end if;
    new.caricato_da := coalesce(auth.uid(), new.caricato_da, tasks_private.attore());
    if auth.uid() is not null then
      new.caricato_at := now();
      new.eliminato_at := null;
    end if;
    if new.commento_id is not null
       and not exists (select 1 from tasks.commenti c where c.id = new.commento_id and c.task_id = new.task_id) then
      new.commento_id := null;
    end if;
  else
    new.id := old.id;
    new.task_id := old.task_id;
    new.percorso := old.percorso;
    new.caricato_da := old.caricato_da;
    new.caricato_at := old.caricato_at;
    if new.eliminato_at is distinct from old.eliminato_at then
      new.eliminato_at := case when new.eliminato_at is not null then now() end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_allegati_prima on tasks.allegati;
create trigger trg_allegati_prima
  before insert or update on tasks.allegati
  for each row execute function tasks_private.allegati_prima();

create or replace function tasks_private.allegati_dopo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform tasks_private.scrivi_storico(new.task_id, 'allegato', jsonb_build_object('nome', new.nome, 'id', new.id));
    -- La prima foto diventa la copertina della scheda.
    if new.tipo_mime like 'image/%' then
      update tasks.task set copertina_id = new.id where id = new.task_id and copertina_id is null;
    end if;
  elsif new.eliminato_at is not null and old.eliminato_at is null then
    update tasks.task set copertina_id = null where id = new.task_id and copertina_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_allegati_dopo on tasks.allegati;
create trigger trg_allegati_dopo
  after insert or update on tasks.allegati
  for each row execute function tasks_private.allegati_dopo();

create or replace function tasks_private.manager_persone_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.creato_da := tasks_private.attore();
  new.creato_at := now();
  return new;
end;
$$;

drop trigger if exists trg_manager_persone_prima on tasks.manager_persone;
create trigger trg_manager_persone_prima
  before insert on tasks.manager_persone
  for each row execute function tasks_private.manager_persone_prima();

create or replace function tasks_private.collegamenti_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.creato_da := tasks_private.attore();
  new.creato_at := now();
  return new;
end;
$$;

drop trigger if exists trg_collegamenti_prima on tasks.collegamenti;
create trigger trg_collegamenti_prima
  before insert on tasks.collegamenti
  for each row execute function tasks_private.collegamenti_prima();

-- =====================================================================================================
-- Funzioni chiamabili dalle app
-- =====================================================================================================

-- Crea un'attività con persone, osservatori, checklist, sottotask e collegamenti in un colpo solo.
-- p: { titolo, descrizione?, categoria_id?, sottocategoria_id?, stato_id?, priorita?, data_inizio?, scadenza?,
--      ora_scadenza?, stima_minuti?, ricorrenza_unita?, ricorrenza_intervallo?, ricorrenza_fine?, preavviso_giorni?,
--      personale?, in_sequenza?, conferma_tutti?, servizio?, link?, app_origine?, dati?, padre_id?, ordine?,
--      assegnatari?: uuid[], osservatori?: uuid[], checklist?: text[], sottotask?: p[],
--      collegamenti?: [{ app_slug, tipo, rif_id?, etichetta?, url? }] }
create or replace function tasks.crea_task(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_padre uuid := nullif(p ->> 'padre_id', '')::uuid;
  v_ordine double precision;
  v_categoria text;
  v_i integer := 0;
  x jsonb;
  u text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Dati attività non validi.' using errcode = '22023';
  end if;
  if coalesce(btrim(p ->> 'titolo'), '') = '' then
    raise exception 'Scrivi il titolo dell''attività.' using errcode = '22023';
  end if;

  if v_padre is not null then
    select categoria_id into v_categoria from tasks.task where id = v_padre;
    v_ordine := coalesce((p ->> 'ordine')::double precision,
                         (select coalesce(max(ordine), 0) + 1 from tasks.task where padre_id = v_padre));
  else
    v_ordine := coalesce((p ->> 'ordine')::double precision, extract(epoch from now()));
  end if;

  insert into tasks.task (
    padre_id, ordine, categoria_id, sottocategoria_id, titolo, descrizione, stato_id, priorita,
    data_inizio, scadenza, ora_scadenza, stima_minuti, ricorrenza_unita, ricorrenza_intervallo, ricorrenza_fine,
    preavviso_giorni, personale, in_sequenza, conferma_tutti, servizio, link, app_origine, dati
  ) values (
    v_padre,
    v_ordine,
    coalesce(nullif(p ->> 'categoria_id', ''), v_categoria, 'generale'),
    nullif(p ->> 'sottocategoria_id', '')::uuid,
    btrim(p ->> 'titolo'),
    nullif(btrim(coalesce(p ->> 'descrizione', '')), ''),
    coalesce(nullif(p ->> 'stato_id', ''), tasks_private.primo_stato_aperto()),
    coalesce(nullif(p ->> 'priorita', ''), 'normale'),
    nullif(p ->> 'data_inizio', '')::date,
    nullif(p ->> 'scadenza', '')::date,
    nullif(p ->> 'ora_scadenza', '')::time,
    nullif(p ->> 'stima_minuti', '')::integer,
    nullif(p ->> 'ricorrenza_unita', ''),
    nullif(p ->> 'ricorrenza_intervallo', '')::integer,
    nullif(p ->> 'ricorrenza_fine', '')::date,
    nullif(p ->> 'preavviso_giorni', '')::integer,
    coalesce((p ->> 'personale')::boolean, false),
    coalesce((p ->> 'in_sequenza')::boolean, false),
    coalesce((p ->> 'conferma_tutti')::boolean, false),
    nullif(p ->> 'servizio', ''),
    nullif(btrim(coalesce(p ->> 'link', '')), ''),
    nullif(p ->> 'app_origine', ''),
    coalesce(case when jsonb_typeof(p -> 'dati') = 'object' then p -> 'dati' end, '{}'::jsonb)
  )
  returning id into v_id;

  for u in select jsonb_array_elements_text(coalesce(p -> 'assegnatari', '[]'::jsonb)) loop
    v_i := v_i + 1;
    insert into tasks.assegnatari (task_id, user_id, ordine) values (v_id, u::uuid, v_i) on conflict do nothing;
  end loop;

  for u in select jsonb_array_elements_text(coalesce(p -> 'osservatori', '[]'::jsonb)) loop
    insert into tasks.osservatori (task_id, user_id) values (v_id, u::uuid) on conflict do nothing;
  end loop;

  v_i := 0;
  for u in select jsonb_array_elements_text(coalesce(p -> 'checklist', '[]'::jsonb)) loop
    if btrim(u) <> '' then
      v_i := v_i + 1;
      insert into tasks.checklist (task_id, testo, ordine) values (v_id, u, v_i);
    end if;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p -> 'collegamenti', '[]'::jsonb)) loop
    insert into tasks.collegamenti (task_id, app_slug, tipo, rif_id, etichetta, url)
    values (v_id, x ->> 'app_slug', x ->> 'tipo', x ->> 'rif_id', x ->> 'etichetta', x ->> 'url')
    on conflict do nothing;
  end loop;

  if v_padre is null then
    v_i := 0;
    for x in select * from jsonb_array_elements(coalesce(p -> 'sottotask', '[]'::jsonb)) loop
      if coalesce(btrim(x ->> 'titolo'), '') <> '' then
        v_i := v_i + 1;
        perform tasks.crea_task(x || jsonb_build_object('padre_id', v_id, 'ordine', v_i, 'app_origine', p ->> 'app_origine'));
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

-- Completa (= stato "fatto"; le ricorrenti passano alla prossima occorrenza).
create or replace function tasks.completa(p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t tasks.task%rowtype;
  v_fatto text := (select id from tasks.stati where tipo = 'fatto' order by ordine limit 1);
begin
  select * into t from tasks.task where id = p_id for update;
  if not found then
    raise exception 'Attività non trovata: ricarica la pagina.' using errcode = 'P0002';
  end if;
  if t.completata_at is not null then
    raise exception 'Attività già completata da qualcun altro.' using errcode = '40001';
  end if;
  update tasks.task set stato_id = v_fatto where id = p_id returning * into t;
  return jsonb_build_object('chiusa', t.completata_at is not null, 'prossima_scadenza',
                            case when t.completata_at is null then t.scadenza end);
end;
$$;

-- Annulla l'ultimo completamento (pulsante "Annulla" o riapertura dallo storico).
create or replace function tasks.annulla_completamento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t tasks.task%rowtype;
  c tasks.completamenti%rowtype;
  v_prec timestamptz;
begin
  if auth.uid() is not null and not tasks_private.puo_vedere(p_id) then
    raise exception 'Attività non trovata: ricarica la pagina.' using errcode = 'P0002';
  end if;
  select * into t from tasks.task where id = p_id for update;
  if not found then
    raise exception 'Attività non trovata: ricarica la pagina.' using errcode = 'P0002';
  end if;
  select * into c from tasks.completamenti where task_id = p_id order by completata_at desc limit 1;
  if c.id is not null then
    delete from tasks.completamenti where id = c.id;
  end if;
  select completata_at into v_prec from tasks.completamenti where task_id = p_id order by completata_at desc limit 1;

  perform set_config('tasks.silenzioso', 'on', true);
  update tasks.task
     set stato_id = tasks_private.primo_stato_aperto(),
         scadenza = case when t.ricorrenza_unita is not null and t.completata_at is null then coalesce(c.scadenza, t.scadenza) else t.scadenza end,
         data_inizio = case when t.ricorrenza_unita is not null and t.completata_at is null and t.data_inizio is not null and c.scadenza is not null
                            then t.data_inizio - (t.scadenza - c.scadenza) else t.data_inizio end,
         completata_at = null,
         completata_da = null,
         ultimo_completamento_at = v_prec
   where id = p_id;
  perform set_config('tasks.silenzioso', 'off', true);
  perform tasks_private.scrivi_storico(p_id, 'riaperta');
end;
$$;

-- La mia parte di un'attività con conferma di tutti (o la tolgo).
create or replace function tasks.segna_mia_parte(p_id uuid, p_fatta boolean default true)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update tasks.assegnatari set fatto_at = case when p_fatta then now() end
   where task_id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'Non sei tra le persone di questa attività.' using errcode = '42501';
  end if;
end;
$$;

-- Segna lette le notifiche (null = tutte quelle della persona, eventualmente di una attività).
create or replace function tasks.segna_notifiche_lette(p_ids uuid[] default null, p_task uuid default null)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with x as (
    update tasks.notifiche set letta_at = now()
     where user_id = auth.uid() and letta_at is null
       and (p_ids is null or id = any (p_ids))
       and (p_task is null or task_id = p_task)
    returning 1
  )
  select count(*)::integer from x
$$;

-- Chat letta fino a ora (pallino dei non letti) + notifiche di quella attività.
create or replace function tasks.segna_letta(p_task uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not tasks_private.puo_vedere(p_task) then
    return;
  end if;
  insert into tasks.letture (task_id, user_id, letto_at) values (p_task, auth.uid(), now())
  on conflict (task_id, user_id) do update set letto_at = excluded.letto_at;
  update tasks.notifiche set letta_at = now()
   where user_id = auth.uid() and task_id = p_task and letta_at is null and tipo in ('commento', 'menzione');
end;
$$;

-- Cestino più vecchio di un anno (solo job con la secret key): prima i file, poi le righe.
create or replace function tasks.da_eliminare_definitivamente(p_giorni integer default 365)
returns table (task_id uuid, percorsi text[])
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         coalesce(array_agg(a.percorso) filter (where a.percorso is not null), '{}'::text[])
  from tasks.task t
  left join tasks.allegati a on a.task_id in (select s.id from tasks.task s where s.radice_id = t.id)
  where t.padre_id is null and t.eliminata_at is not null and t.eliminata_at < now() - make_interval(days => p_giorni)
  group by t.id
$$;

create or replace function tasks.elimina_definitivamente(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from tasks.task
   where id = any (p_ids) and padre_id is null and eliminata_at is not null and eliminata_at < now() - interval '30 days';
  get diagnostics v_n = row_count;
  -- Notifiche lette da più di 90 giorni.
  delete from tasks.notifiche where letta_at is not null and letta_at < now() - interval '90 days';
  return v_n;
end;
$$;

-- =====================================================================================================
-- Viste per le app
-- =====================================================================================================

create or replace view tasks.v_persone
with (security_invoker = true) as
select * from tasks_private.persone();

create or replace view tasks.v_app
with (security_invoker = true) as
select * from tasks_private.app();

create or replace view tasks.v_task
with (security_invoker = true) as
select t.*,
       s.tipo as stato_tipo,
       coalesce((
         select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'ordine', a.ordine, 'fatto_at', a.fatto_at,
                                             'assegnato_da', a.assegnato_da, 'assegnato_at', a.assegnato_at)
                          order by a.ordine, a.assegnato_at)
         from tasks.assegnatari a where a.task_id = t.id
       ), '[]'::jsonb) as assegnatari,
       coalesce((select array_agg(o.user_id) from tasks.osservatori o where o.task_id = t.id), '{}'::uuid[]) as osservatori,
       coalesce((select array_agg(d.dipende_da) from tasks.dipendenze d where d.task_id = t.id), '{}'::uuid[]) as dipende_da,
       st.n_sottotask,
       st.n_sottotask_fatte,
       ck.n_checklist,
       ck.n_checklist_fatte,
       cm.n_commenti,
       cm.ultimo_commento_at,
       case when exists (select 1 from tasks.osservatori o where o.task_id = t.id and o.user_id = auth.uid())
            then (select count(*)::integer from tasks.commenti c
                  where c.task_id = t.id and c.eliminato_at is null and c.autore is distinct from auth.uid()
                    and c.creato_at > coalesce((select l.letto_at from tasks.letture l where l.task_id = t.id and l.user_id = auth.uid()), '-infinity'::timestamptz))
            else 0 end as n_non_letti,
       (select count(*)::integer from tasks.allegati a where a.task_id = t.id and a.eliminato_at is null) as n_allegati,
       (select a.percorso from tasks.allegati a where a.id = t.copertina_id and a.eliminato_at is null) as copertina_percorso,
       coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'app_slug', g.app_slug, 'tipo', g.tipo, 'rif_id', g.rif_id,
                                                     'etichetta', g.etichetta, 'url', g.url) order by g.creato_at)
                 from tasks.collegamenti g where g.task_id = t.id), '[]'::jsonb) as collegamenti,
       (select count(*)::integer from tasks.completamenti k where k.task_id = t.id) as n_completamenti
from tasks.task t
join tasks.stati s on s.id = t.stato_id
left join lateral (
  select count(*)::integer as n_sottotask,
         count(*) filter (where ss.tipo = 'fatto')::integer as n_sottotask_fatte
  from tasks.task x join tasks.stati ss on ss.id = x.stato_id
  where x.padre_id = t.id and x.eliminata_at is null
) st on true
left join lateral (
  select count(*)::integer as n_checklist, count(*) filter (where c.fatta_at is not null)::integer as n_checklist_fatte
  from tasks.checklist c where c.task_id = t.id
) ck on true
left join lateral (
  select count(*)::integer as n_commenti, max(c.creato_at) as ultimo_commento_at
  from tasks.commenti c where c.task_id = t.id and c.eliminato_at is null
) cm on true;

create or replace view tasks.v_completamenti
with (security_invoker = true) as
select k.*, t.titolo, t.categoria_id, t.sottocategoria_id, t.servizio, t.padre_id, t.radice_id, t.scadenza as scadenza_attuale
from tasks.completamenti k
join tasks.task t on t.id = k.task_id;

-- =====================================================================================================
-- RLS, permessi
-- =====================================================================================================

alter table tasks.categorie enable row level security;
alter table tasks.sottocategorie enable row level security;
alter table tasks.stati enable row level security;
alter table tasks.manager_persone enable row level security;
alter table tasks.task enable row level security;
alter table tasks.assegnatari enable row level security;
alter table tasks.osservatori enable row level security;
alter table tasks.dipendenze enable row level security;
alter table tasks.checklist enable row level security;
alter table tasks.commenti enable row level security;
alter table tasks.reazioni enable row level security;
alter table tasks.allegati enable row level security;
alter table tasks.collegamenti enable row level security;
alter table tasks.storico enable row level security;
alter table tasks.completamenti enable row level security;
alter table tasks.letture enable row level security;
alter table tasks.notifiche enable row level security;

-- Anagrafiche: tutti leggono, gli admin modificano (sottocategorie anche i manager).
drop policy if exists categorie_lettura on tasks.categorie;
create policy categorie_lettura on tasks.categorie for select to authenticated using (true);
drop policy if exists categorie_admin on tasks.categorie;
create policy categorie_admin on tasks.categorie for all to authenticated
  using ((select tasks_private.e_admin())) with check ((select tasks_private.e_admin()));

drop policy if exists sottocategorie_lettura on tasks.sottocategorie;
create policy sottocategorie_lettura on tasks.sottocategorie for select to authenticated using (true);
drop policy if exists sottocategorie_gestione on tasks.sottocategorie;
create policy sottocategorie_gestione on tasks.sottocategorie for all to authenticated
  using ((select tasks_private.e_admin()) or (select tasks_private.e_manager()))
  with check ((select tasks_private.e_admin()) or (select tasks_private.e_manager()));

drop policy if exists stati_lettura on tasks.stati;
create policy stati_lettura on tasks.stati for select to authenticated using (true);
drop policy if exists stati_admin on tasks.stati;
create policy stati_admin on tasks.stati for all to authenticated
  using ((select tasks_private.e_admin())) with check ((select tasks_private.e_admin()));

drop policy if exists manager_persone_lettura on tasks.manager_persone;
create policy manager_persone_lettura on tasks.manager_persone for select to authenticated
  using ((select tasks_private.e_admin()) or manager_id = (select auth.uid()) or persona_id = (select auth.uid()));
drop policy if exists manager_persone_admin on tasks.manager_persone;
create policy manager_persone_admin on tasks.manager_persone for all to authenticated
  using ((select tasks_private.e_admin())) with check ((select tasks_private.e_admin()));

-- Attività: vede (e modifica) chi è coinvolto, admin, manager delle persone coinvolte.
drop policy if exists task_lettura on tasks.task;
create policy task_lettura on tasks.task for select to authenticated
  using (creato_da = (select auth.uid()) or radice_id in (select tasks_private.radici_visibili()));
drop policy if exists task_inserimento on tasks.task;
create policy task_inserimento on tasks.task for insert to authenticated
  with check ((select auth.uid()) is not null);
drop policy if exists task_modifica on tasks.task;
create policy task_modifica on tasks.task for update to authenticated
  using (creato_da = (select auth.uid()) or radice_id in (select tasks_private.radici_visibili()))
  with check (true);

-- Tabelle figlie: valgono le regole dell'attività.
do $$
declare
  v_tab text;
begin
  foreach v_tab in array array['assegnatari', 'osservatori', 'checklist', 'collegamenti'] loop
    execute format('drop policy if exists %1$s_tutto on tasks.%1$s', v_tab);
    execute format(
      'create policy %1$s_tutto on tasks.%1$s for all to authenticated
         using (task_id in (select tasks_private.task_visibili()))
         with check (task_id in (select tasks_private.task_visibili()))', v_tab);
  end loop;
end $$;

drop policy if exists dipendenze_tutto on tasks.dipendenze;
create policy dipendenze_tutto on tasks.dipendenze for all to authenticated
  using (task_id in (select tasks_private.task_visibili()))
  with check (task_id in (select tasks_private.task_visibili()) and dipende_da in (select tasks_private.task_visibili()));

drop policy if exists storico_lettura on tasks.storico;
create policy storico_lettura on tasks.storico for select to authenticated
  using (task_id in (select tasks_private.task_visibili()));

drop policy if exists completamenti_lettura on tasks.completamenti;
create policy completamenti_lettura on tasks.completamenti for select to authenticated
  using (task_id in (select tasks_private.task_visibili()));

drop policy if exists commenti_lettura on tasks.commenti;
create policy commenti_lettura on tasks.commenti for select to authenticated
  using (task_id in (select tasks_private.task_visibili()));
drop policy if exists commenti_inserimento on tasks.commenti;
create policy commenti_inserimento on tasks.commenti for insert to authenticated
  with check (task_id in (select tasks_private.task_visibili()));
drop policy if exists commenti_modifica on tasks.commenti;
create policy commenti_modifica on tasks.commenti for update to authenticated
  using (autore = (select auth.uid())) with check (autore = (select auth.uid()));

drop policy if exists reazioni_lettura on tasks.reazioni;
create policy reazioni_lettura on tasks.reazioni for select to authenticated
  using (commento_id in (select c.id from tasks.commenti c));
drop policy if exists reazioni_mie on tasks.reazioni;
create policy reazioni_mie on tasks.reazioni for insert to authenticated
  with check (user_id = (select auth.uid()) and commento_id in (select c.id from tasks.commenti c));
drop policy if exists reazioni_togli on tasks.reazioni;
create policy reazioni_togli on tasks.reazioni for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists allegati_lettura on tasks.allegati;
create policy allegati_lettura on tasks.allegati for select to authenticated
  using (task_id in (select tasks_private.task_visibili()));
drop policy if exists allegati_inserimento on tasks.allegati;
create policy allegati_inserimento on tasks.allegati for insert to authenticated
  with check (task_id in (select tasks_private.task_visibili()));
drop policy if exists allegati_modifica on tasks.allegati;
create policy allegati_modifica on tasks.allegati for update to authenticated
  using (task_id in (select tasks_private.task_visibili()))
  with check (task_id in (select tasks_private.task_visibili()));

drop policy if exists letture_mie on tasks.letture;
create policy letture_mie on tasks.letture for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists notifiche_mie on tasks.notifiche;
create policy notifiche_mie on tasks.notifiche for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifiche_segna on tasks.notifiche;
create policy notifiche_segna on tasks.notifiche for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Grant: niente DELETE sulle attività (cestino = eliminata_at; definitiva solo dal job).
revoke all on all tables in schema tasks from public, anon, authenticated;
grant select on tasks.categorie, tasks.sottocategorie, tasks.stati to authenticated;
grant insert, update, delete on tasks.categorie, tasks.sottocategorie, tasks.stati to authenticated;
grant select, insert, delete on tasks.manager_persone to authenticated;
grant select, insert, update on tasks.task to authenticated;
grant select, insert, update, delete on tasks.assegnatari, tasks.osservatori, tasks.dipendenze, tasks.checklist, tasks.collegamenti to authenticated;
grant select, insert on tasks.commenti to authenticated;
grant update (testo, menzioni, eliminato_at) on tasks.commenti to authenticated;
grant select, insert, delete on tasks.reazioni to authenticated;
grant select, insert on tasks.allegati to authenticated;
grant update (eliminato_at) on tasks.allegati to authenticated;
grant select on tasks.storico, tasks.completamenti to authenticated;
grant select, insert, update on tasks.letture to authenticated;
grant select on tasks.notifiche to authenticated;
grant update (letta_at, archiviata_at) on tasks.notifiche to authenticated;
grant select on tasks.v_task, tasks.v_persone, tasks.v_completamenti, tasks.v_app to authenticated;
grant all on all tables in schema tasks to service_role;

revoke all on all functions in schema tasks_private from public, anon;
grant execute on all functions in schema tasks_private to authenticated, service_role;
-- Scrivono storico e notifiche: solo dai trigger (che girano come proprietario).
revoke execute on function tasks_private.notifica(uuid[], text, uuid, text, uuid, boolean) from authenticated;
revoke execute on function tasks_private.scrivi_storico(uuid, text, jsonb) from authenticated;
revoke all on function tasks.crea_task(jsonb) from public, anon;
revoke all on function tasks.completa(uuid) from public, anon;
revoke all on function tasks.annulla_completamento(uuid) from public, anon;
revoke all on function tasks.segna_mia_parte(uuid, boolean) from public, anon;
revoke all on function tasks.segna_notifiche_lette(uuid[], uuid) from public, anon;
revoke all on function tasks.segna_letta(uuid) from public, anon;
revoke all on function tasks.da_eliminare_definitivamente(integer) from public, anon, authenticated;
revoke all on function tasks.elimina_definitivamente(uuid[]) from public, anon, authenticated;
grant execute on function tasks.crea_task(jsonb), tasks.completa(uuid), tasks.annulla_completamento(uuid),
  tasks.segna_mia_parte(uuid, boolean), tasks.segna_notifiche_lette(uuid[], uuid), tasks.segna_letta(uuid)
  to authenticated, service_role;
grant execute on function tasks.da_eliminare_definitivamente(integer), tasks.elimina_definitivamente(uuid[]) to service_role;

-- =====================================================================================================
-- Allegati (bucket privato `tasks`) e tempo reale
-- =====================================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tasks', 'tasks', false, 52428800, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip', 'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/msword',
  'video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/mp4',
  'model/3mf', 'model/stl', 'application/octet-stream'
])
on conflict (id) do nothing;

drop policy if exists tasks_allegati_lettura on storage.objects;
create policy tasks_allegati_lettura on storage.objects for select to authenticated
  using (bucket_id = 'tasks' and tasks_private.puo_vedere(tasks_private.task_da_percorso(name)));
drop policy if exists tasks_allegati_caricamento on storage.objects;
create policy tasks_allegati_caricamento on storage.objects for insert to authenticated
  with check (bucket_id = 'tasks' and tasks_private.puo_vedere(tasks_private.task_da_percorso(name)));
drop policy if exists tasks_allegati_rimozione on storage.objects;
create policy tasks_allegati_rimozione on storage.objects for delete to authenticated
  using (bucket_id = 'tasks' and owner_id = (select auth.uid())::text);

do $$
declare
  v_tab text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tab in array array['task', 'assegnatari', 'checklist', 'commenti', 'reazioni', 'allegati', 'notifiche'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'tasks' and tablename = v_tab) then
        execute format('alter publication supabase_realtime add table tasks.%I', v_tab);
      end if;
    end loop;
  end if;
end $$;
