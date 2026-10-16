-- =====================================================================================================
-- Solleciti: un admin, o il manager di una persona, le ricorda un'attività in cui è coinvolta.
-- - normale: notifica (campanella e push) nell'app della categoria dell'attività;
-- - forte: in più un popup in quell'app che resta finché la persona non lo conferma.
-- app_slug = app della categoria se la persona ci ha accesso, null = in tutte le sue app (come le notifiche).
-- Si scrive solo con tasks.sollecita(); la persona conferma con tasks.conferma_sollecito().
-- =====================================================================================================

set lock_timeout = '5s';

create table if not exists tasks.solleciti (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks.task (id) on delete cascade,
  da uuid not null,
  a uuid not null references auth.users (id) on delete cascade,
  forte boolean not null default false,
  messaggio text,
  app_slug text,
  creato_at timestamptz not null default now(),
  visto_at timestamptz,
  constraint solleciti_messaggio_check check (messaggio is null or char_length(messaggio) <= 500),
  constraint solleciti_persone_check check (da <> a)
);
create index if not exists solleciti_a_idx on tasks.solleciti (a, creato_at desc) where visto_at is null;
create index if not exists solleciti_task_idx on tasks.solleciti (task_id, creato_at desc);
comment on table tasks.solleciti is 'Solleciti di admin/manager a una persona su un''attività. forte = popup da confermare nell''app app_slug (null = tutte). visto_at = popup confermato o notifica letta.';

alter table tasks.notifiche drop constraint if exists notifiche_tipo_check;
alter table tasks.notifiche add constraint notifiche_tipo_check check (tipo in (
  'assegnata', 'menzione', 'commento', 'completata', 'stato', 'tocca_a_te', 'sottotask_finite', 'scadenza', 'riaperta',
  'sollecito', 'sollecito_forte'
));

-- Manda un sollecito. Errori in italiano: li mostra l'interfaccia.
create or replace function tasks.sollecita(p_task uuid, p_persona uuid, p_forte boolean default false, p_messaggio text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_task tasks.task%rowtype;
  v_app text;
  v_id uuid;
  v_messaggio text := nullif(btrim(coalesce(p_messaggio, '')), '');
begin
  if v_me is null then
    raise exception 'Serve l''accesso' using errcode = '42501';
  end if;
  if p_persona is null or p_persona = v_me then
    raise exception 'Non puoi sollecitare te stesso' using errcode = '22023';
  end if;
  if not (tasks_private.e_admin()
          or exists (select 1 from tasks.manager_persone mp where mp.manager_id = v_me and mp.persona_id = p_persona)) then
    raise exception 'Puoi sollecitare solo le persone che segui come manager' using errcode = '42501';
  end if;
  if not tasks_private.puo_vedere(p_task) then
    raise exception 'Attività non trovata' using errcode = '42501';
  end if;
  select * into v_task from tasks.task where id = p_task;
  if v_task.personale then
    raise exception 'Le attività personali non si sollecitano' using errcode = '22023';
  end if;
  if v_task.completata_at is not null or v_task.eliminata_at is not null or v_task.archiviata_at is not null then
    raise exception 'L''attività è già chiusa' using errcode = '22023';
  end if;
  if not (v_task.creato_da = p_persona
          or exists (select 1 from tasks.assegnatari x where x.task_id = p_task and x.user_id = p_persona)
          or exists (select 1 from tasks.osservatori x where x.task_id = p_task and x.user_id = p_persona)) then
    raise exception 'La persona non è coinvolta in questa attività' using errcode = '22023';
  end if;
  if char_length(coalesce(v_messaggio, '')) > 500 then
    raise exception 'Messaggio troppo lungo (massimo 500 caratteri)' using errcode = '22023';
  end if;
  if exists (select 1 from tasks.solleciti s
             where s.task_id = p_task and s.a = p_persona and s.da = v_me and s.creato_at > now() - interval '1 minute') then
    raise exception 'Hai appena mandato un sollecito a questa persona: aspetta un minuto' using errcode = '22023';
  end if;

  select c.app_slug into v_app from tasks.categorie c where c.id = v_task.categoria_id;
  insert into tasks.solleciti (task_id, da, a, forte, messaggio, app_slug)
  values (p_task, v_me, p_persona, coalesce(p_forte, false), v_messaggio,
          case when v_app is not null and tasks_private.ha_app(p_persona, v_app) then v_app end)
  returning id into v_id;

  perform tasks_private.notifica(array[p_persona], case when p_forte then 'sollecito_forte' else 'sollecito' end, p_task, v_messaggio);
  perform tasks_private.scrivi_storico(p_task, 'sollecito', jsonb_build_object('persona', p_persona, 'forte', coalesce(p_forte, false)));
  return v_id;
end;
$$;

-- La persona conferma il popup (o lo chiude aprendo l'attività): segna visti i suoi solleciti di
-- quell'attività e lette le notifiche relative.
create or replace function tasks.conferma_sollecito(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  select task_id into v_task from tasks.solleciti where id = p_id and a = auth.uid();
  if v_task is null then
    return;
  end if;
  update tasks.solleciti set visto_at = now() where a = auth.uid() and task_id = v_task and visto_at is null;
  update tasks.notifiche set letta_at = now()
   where user_id = auth.uid() and task_id = v_task and tipo in ('sollecito', 'sollecito_forte') and letta_at is null;
end;
$$;

-- Sollecito normale letto (dalla campanella o aprendo l'attività) = visto. Il forte resta finché
-- la persona non conferma il popup.
create or replace function tasks_private.notifiche_sollecito_letta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update tasks.solleciti set visto_at = new.letta_at
   where a = new.user_id and task_id = new.task_id and not forte and visto_at is null;
  return null;
end;
$$;

drop trigger if exists trg_notifiche_sollecito_letta on tasks.notifiche;
create trigger trg_notifiche_sollecito_letta
  after update of letta_at on tasks.notifiche
  for each row
  when (new.tipo = 'sollecito' and old.letta_at is null and new.letta_at is not null)
  execute function tasks_private.notifiche_sollecito_letta();

alter table tasks.solleciti enable row level security;

-- Li vede chi li riceve e chi li manda (per sapere se sono stati visti).
drop policy if exists solleciti_lettura on tasks.solleciti;
create policy solleciti_lettura on tasks.solleciti for select to authenticated
  using (a = (select auth.uid()) or da = (select auth.uid()));

revoke all on tasks.solleciti from public, anon, authenticated;
grant select on tasks.solleciti to authenticated;
grant all on tasks.solleciti to service_role;

revoke all on function tasks_private.notifiche_sollecito_letta() from public, anon, authenticated;
revoke all on function tasks.sollecita(uuid, uuid, boolean, text) from public, anon;
revoke all on function tasks.conferma_sollecito(uuid) from public, anon;
grant execute on function tasks.sollecita(uuid, uuid, boolean, text), tasks.conferma_sollecito(uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'tasks' and tablename = 'solleciti') then
    alter publication supabase_realtime add table tasks.solleciti;
  end if;
end $$;
