-- =====================================================================================================
-- Sicurezza (revisione del 2026-11-05).
--
-- 1. "Loggato" non basta: serve una persona attiva in public."User". Chi ha un account Supabase Auth
--    senza riga in User (per esempio registrato da solo) o una persona disattivata ma non bloccata
--    in Auth non vede e non scrive niente: attività, persone, app, notifiche, file, Google.
-- 2. Link delle attività e url dei collegamenti: solo pagine dell'app ("/...", non "//altro-sito")
--    o indirizzi https, senza caratteri di controllo (il browser li toglie: "/<tab>/sito" = "//sito").
-- 3. Messaggi eliminati: il testo sparisce anche dal database e dalle notifiche, e non si recuperano.
--    Allegati eliminati: il file non si scarica più.
-- 4. "Sta scrivendo" della chat su canale Realtime privato (chat-presenza:<id attività>): lo raggiunge
--    solo chi vede l'attività. Prima bastava la chiave pubblica e l'id.
--
-- Le funzioni riscritte qui sono uguali a prima tranne i controlli nuovi.
-- =====================================================================================================

set lock_timeout = '5s';

-- La persona della sessione esiste in public."User" ed è attiva.
create or replace function tasks_private.e_attivo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."User" u
    where u."authUserId" = (select auth.uid()) and u."isActive"
  )
$$;

-- =====================================================================================================
-- 1. Visibilità solo per persone attive
-- =====================================================================================================

create or replace function tasks_private.radici_visibili()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid, coalesce(app_auth.has_role('Admin'), false) as admin, tasks_private.e_attivo() as attivo
  ),
  seguiti as (
    select mp.persona_id from tasks.manager_persone mp, me where mp.manager_id = me.uid
  )
  select t.radice_id
  from tasks.task t, me
  where me.uid is not null
    and me.attivo
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
  where me.attivo and t.personale and t.padre_id is null and t.creato_da = me.uid
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
  where (select tasks_private.e_attivo())
    and (t.creato_da = auth.uid() or t.radice_id in (select tasks_private.radici_visibili()))
$$;

create or replace function tasks_private.puo_vedere(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select tasks_private.e_attivo() and exists (
    select 1 from tasks.task t
    where t.id = p_task
      and (t.creato_da = auth.uid() or t.radice_id in (select tasks_private.radici_visibili()))
  )
$$;

create or replace function tasks_private.puo_eliminare(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select tasks_private.e_attivo() and exists (
    select 1 from tasks.task t
    where t.id = p_task
      and (
        t.creato_da = auth.uid()
        or (select app_auth.has_role('Admin'))
        or ((select app_auth.has_role('Manager')) and tasks_private.puo_vedere(t.id))
      )
  )
$$;

-- Persone e app: prima bastava essere loggati.
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
    and ((select auth.role()) = 'service_role' or (select tasks_private.e_attivo()))
$$;

create or replace function tasks_private.app()
returns table (slug text, nome text, url text, logo_url text, ordine integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.slug, a.name, a.url, a."logoUrl", a."sortOrder"
  from public."RicreoApp" a
  where a."isActive" and ((select auth.role()) = 'service_role' or (select tasks_private.e_attivo()))
$$;

-- Policy che controllavano solo l'utente della sessione.
drop policy if exists task_lettura on tasks.task;
create policy task_lettura on tasks.task for select to authenticated
  using ((select tasks_private.e_attivo())
         and (creato_da = (select auth.uid()) or radice_id in (select tasks_private.radici_visibili())));
drop policy if exists task_inserimento on tasks.task;
create policy task_inserimento on tasks.task for insert to authenticated
  with check ((select tasks_private.e_attivo()));
drop policy if exists task_modifica on tasks.task;
create policy task_modifica on tasks.task for update to authenticated
  using ((select tasks_private.e_attivo())
         and (creato_da = (select auth.uid()) or radice_id in (select tasks_private.radici_visibili())))
  with check (true);

drop policy if exists categorie_lettura on tasks.categorie;
create policy categorie_lettura on tasks.categorie for select to authenticated
  using ((select tasks_private.e_attivo()));
drop policy if exists sottocategorie_lettura on tasks.sottocategorie;
create policy sottocategorie_lettura on tasks.sottocategorie for select to authenticated
  using ((select tasks_private.e_attivo()));
drop policy if exists stati_lettura on tasks.stati;
create policy stati_lettura on tasks.stati for select to authenticated
  using ((select tasks_private.e_attivo()));

drop policy if exists manager_persone_lettura on tasks.manager_persone;
create policy manager_persone_lettura on tasks.manager_persone for select to authenticated
  using ((select tasks_private.e_attivo())
         and ((select tasks_private.e_admin()) or manager_id = (select auth.uid()) or persona_id = (select auth.uid())));

drop policy if exists commenti_modifica on tasks.commenti;
create policy commenti_modifica on tasks.commenti for update to authenticated
  using (autore = (select auth.uid()) and (select tasks_private.e_attivo()))
  with check (autore = (select auth.uid()) and (select tasks_private.e_attivo()));

drop policy if exists reazioni_mie on tasks.reazioni;
create policy reazioni_mie on tasks.reazioni for insert to authenticated
  with check (user_id = (select auth.uid()) and (select tasks_private.e_attivo()) and commento_id in (select c.id from tasks.commenti c));
drop policy if exists reazioni_togli on tasks.reazioni;
create policy reazioni_togli on tasks.reazioni for delete to authenticated
  using (user_id = (select auth.uid()) and (select tasks_private.e_attivo()));

drop policy if exists letture_mie on tasks.letture;
create policy letture_mie on tasks.letture for all to authenticated
  using (user_id = (select auth.uid()) and (select tasks_private.e_attivo()))
  with check (user_id = (select auth.uid()) and (select tasks_private.e_attivo()));

drop policy if exists notifiche_mie on tasks.notifiche;
create policy notifiche_mie on tasks.notifiche for select to authenticated
  using (user_id = (select auth.uid()) and (select tasks_private.e_attivo()));
drop policy if exists notifiche_segna on tasks.notifiche;
create policy notifiche_segna on tasks.notifiche for update to authenticated
  using (user_id = (select auth.uid()) and (select tasks_private.e_attivo()))
  with check (user_id = (select auth.uid()) and (select tasks_private.e_attivo()));

drop policy if exists preferenze_mie on tasks.preferenze;
create policy preferenze_mie on tasks.preferenze for all to authenticated
  using (user_id = (select auth.uid()) and (select tasks_private.e_attivo()))
  with check (user_id = (select auth.uid()) and (select tasks_private.e_attivo()));

drop policy if exists solleciti_lettura on tasks.solleciti;
create policy solleciti_lettura on tasks.solleciti for select to authenticated
  using ((a = (select auth.uid()) or da = (select auth.uid())) and (select tasks_private.e_attivo()));

-- Google: niente collegamento né sync per chi non è attivo.
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
  if v_me is null or not tasks_private.e_attivo() then
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
    left join lateral (
      select ap.slug, ap.url
        from tasks_private.app() ap
       where ap.url is not null and tasks_private.ha_app(p_utente, ap.slug)
       order by (ap.slug = c.app_slug) desc, ap.ordine, ap.slug
       limit 1
    ) l on true
   where a.user_id = p_utente
     and exists (select 1 from public."User" u where u."authUserId" = p_utente and u."isActive")
     and (t.scadenza is not null
          or exists (select 1 from tasks.google_sync s where s.utente_id = p_utente and s.task_id = t.id and s.google_task_id is not null))
     and t.eliminata_at is null and t.archiviata_at is null
     and (p.id is null or (p.eliminata_at is null and p.archiviata_at is null))
     and (t.completata_at is null or t.completata_at > now() - interval '30 days')
$$;

create or replace function tasks.google_applica(p_utente uuid, p_task uuid, p_cambi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t tasks.task%rowtype;
  v_padre text;
  v_parte timestamptz;
  v_titolo text;
  v_scad date;
  v_ora time;
  v_fatta boolean;
  v_fatti jsonb := '{}'::jsonb;
begin
  if p_cambi is null or jsonb_typeof(p_cambi) <> 'object' then
    return v_fatti;
  end if;
  -- Persona disattivata: i suoi cambi su Google non toccano più le attività.
  if not exists (select 1 from public."User" u where u."authUserId" = p_utente and u."isActive") then
    return v_fatti;
  end if;
  select * into t from tasks.task where id = p_task for update;
  if not found or t.eliminata_at is not null or t.archiviata_at is not null then
    return v_fatti;
  end if;
  select a.fatto_at into v_parte from tasks.assegnatari a where a.task_id = p_task and a.user_id = p_utente;
  if not found then
    return v_fatti;
  end if;
  perform set_config('tasks.attore', p_utente::text, true);

  -- Eliminata su Google: nel cestino solo se è personale e sua (le altre sono anche di altri).
  if coalesce((p_cambi ->> 'elimina')::boolean, false) then
    if t.personale and t.creato_da = p_utente then
      update tasks.task set eliminata_at = now() where id = p_task;
      return jsonb_build_object('elimina', true);
    end if;
    return v_fatti;
  end if;

  if p_cambi ? 'titolo' then
    v_titolo := btrim(coalesce(p_cambi ->> 'titolo', ''));
    -- Le sottotask su Google si chiamano "Padre › Sotto".
    if t.padre_id is not null then
      select titolo into v_padre from tasks.task where id = t.padre_id;
      if starts_with(v_titolo, v_padre || ' › ') then
        v_titolo := btrim(substr(v_titolo, char_length(v_padre || ' › ') + 1));
      end if;
    end if;
    if char_length(v_titolo) between 1 and 300 and v_titolo is distinct from t.titolo then
      update tasks.task set titolo = v_titolo where id = p_task;
      v_fatti := v_fatti || jsonb_build_object('titolo', v_titolo);
    end if;
  end if;

  if p_cambi ? 'scadenza' or p_cambi ? 'ora' then
    v_scad := case when p_cambi ? 'scadenza' then nullif(p_cambi ->> 'scadenza', '')::date else t.scadenza end;
    v_ora := case when p_cambi ? 'ora' then nullif(p_cambi ->> 'ora', '')::time else t.ora_scadenza end;
    -- Le ricorrenti non restano senza scadenza.
    if v_scad is null and t.ricorrenza_unita is not null then
      v_scad := t.scadenza;
    end if;
    if v_scad is null then
      v_ora := null;
    end if;
    if v_scad is distinct from t.scadenza or v_ora is distinct from t.ora_scadenza then
      update tasks.task
         set scadenza = v_scad,
             ora_scadenza = v_ora,
             data_inizio = case when v_scad is not null and t.data_inizio > v_scad then v_scad else t.data_inizio end
       where id = p_task;
      v_fatti := v_fatti || jsonb_build_object('scadenza', v_scad, 'ora', to_char(v_ora, 'HH24:MI'));
    end if;
  end if;

  if p_cambi ? 'fatta' then
    v_fatta := (p_cambi ->> 'fatta')::boolean;
    if v_fatta then
      if t.conferma_tutti and t.completata_at is null and v_parte is null then
        update tasks.assegnatari set fatto_at = now() where task_id = p_task and user_id = p_utente;
        v_fatti := v_fatti || jsonb_build_object('fatta', true);
      elsif not t.conferma_tutti and t.completata_at is null then
        -- Le ricorrenti passano alla prossima scadenza (trigger), come dall'app.
        update tasks.task set stato_id = (select id from tasks.stati where tipo = 'fatto' order by ordine limit 1) where id = p_task;
        v_fatti := v_fatti || jsonb_build_object('fatta', true);
      end if;
    elsif v_fatta is false then
      if t.completata_at is not null then
        perform tasks.annulla_completamento(p_task);
        v_fatti := v_fatti || jsonb_build_object('fatta', false);
      end if;
      if t.conferma_tutti and v_parte is not null then
        update tasks.assegnatari set fatto_at = null where task_id = p_task and user_id = p_utente;
        v_fatti := v_fatti || jsonb_build_object('fatta', false);
      end if;
    end if;
  end if;

  return v_fatti;
end;
$$;

-- =====================================================================================================
-- 2. Link: pagine dell'app o https
-- =====================================================================================================

alter table tasks.task drop constraint if exists task_link_check;
alter table tasks.task add constraint task_link_check check (
  link is null
  or (link !~ '[[:cntrl:]]' and (link ~ '^https://' or (link ~ '^/' and link !~ '^/[/\\]')))
);

alter table tasks.collegamenti drop constraint if exists collegamenti_url_check;
alter table tasks.collegamenti add constraint collegamenti_url_check check (
  url is null
  or (url !~ '[[:cntrl:]]' and (url ~ '^https://' or (url ~ '^/' and url !~ '^/[/\\]')))
);

-- =====================================================================================================
-- 3. Eliminati davvero
-- =====================================================================================================

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
    -- Un messaggio eliminato resta eliminato.
    if old.eliminato_at is not null then
      new.eliminato_at := old.eliminato_at;
    elsif new.eliminato_at is not null then
      new.eliminato_at := now();
    end if;
    if new.eliminato_at is null and new.testo is distinct from old.testo then
      new.modificato_at := now();
    end if;
  end if;

  -- Eliminato: il testo sparisce anche dal database (la chat mostra "Messaggio eliminato").
  if new.eliminato_at is not null then
    new.testo := '';
    new.menzioni := '{}'::uuid[];
    if tg_op = 'UPDATE' then
      new.modificato_at := old.modificato_at;
    end if;
  end if;
  return new;
end;
$$;

-- Le notifiche riportano un estratto del messaggio: si toglie anche da lì.
create or replace function tasks_private.commenti_eliminati()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update tasks.notifiche set testo = 'Messaggio eliminato'
   where commento_id = new.id and tipo in ('commento', 'menzione');
  return null;
end;
$$;

drop trigger if exists trg_commenti_eliminati on tasks.commenti;
create trigger trg_commenti_eliminati
  after update on tasks.commenti
  for each row
  when (old.eliminato_at is null and new.eliminato_at is not null)
  execute function tasks_private.commenti_eliminati();

-- Messaggi già eliminati prima di questa migration.
update tasks.commenti set testo = '' where eliminato_at is not null and (testo <> '' or cardinality(menzioni) > 0);
update tasks.notifiche n set testo = 'Messaggio eliminato'
  from tasks.commenti c
 where c.id = n.commento_id and c.eliminato_at is not null and n.tipo in ('commento', 'menzione')
   and n.testo is distinct from 'Messaggio eliminato';

-- File: si legge se si vede l'attività e l'allegato non è stato eliminato.
create or replace function tasks_private.file_leggibile(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select tasks_private.puo_vedere(tasks_private.task_da_percorso(p_nome))
     and not exists (select 1 from tasks.allegati a where a.percorso = p_nome and a.eliminato_at is not null)
$$;

drop policy if exists tasks_allegati_lettura on storage.objects;
create policy tasks_allegati_lettura on storage.objects for select to authenticated
  using (bucket_id = 'tasks' and tasks_private.file_leggibile(name));
drop policy if exists tasks_allegati_rimozione on storage.objects;
create policy tasks_allegati_rimozione on storage.objects for delete to authenticated
  using (bucket_id = 'tasks' and owner_id = (select auth.uid())::text and (select tasks_private.e_attivo()));

-- =====================================================================================================
-- 4. Presenza della chat su canale privato
-- =====================================================================================================

-- Topic "chat-presenza:<uuid>" di un'attività che la persona vede.
create or replace function tasks_private.chat_visibile(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic ~* '^chat-presenza:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then tasks_private.puo_vedere(substr(p_topic, 15)::uuid)
    else false
  end
$$;

-- Solo dove c'è Realtime (nel test in PGlite no). Riguarda solo i topic chat-presenza:…
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists tasks_chat_presenza_lettura on realtime.messages';
    execute $p$create policy tasks_chat_presenza_lettura on realtime.messages for select to authenticated
      using (realtime.messages.extension in ('broadcast', 'presence')
             and (select tasks_private.chat_visibile((select realtime.topic()))))$p$;
    execute 'drop policy if exists tasks_chat_presenza_scrittura on realtime.messages';
    execute $p$create policy tasks_chat_presenza_scrittura on realtime.messages for insert to authenticated
      with check (realtime.messages.extension = 'presence'
                  and (select tasks_private.chat_visibile((select realtime.topic()))))$p$;
  end if;
end $$;

-- =====================================================================================================
-- Permessi delle funzioni nuove (le riscritte tengono i loro)
-- =====================================================================================================

revoke all on function tasks_private.e_attivo(), tasks_private.file_leggibile(text), tasks_private.chat_visibile(text) from public, anon;
grant execute on function tasks_private.e_attivo(), tasks_private.file_leggibile(text), tasks_private.chat_visibile(text) to authenticated, service_role;
revoke all on function tasks_private.commenti_eliminati() from public, anon, authenticated;
