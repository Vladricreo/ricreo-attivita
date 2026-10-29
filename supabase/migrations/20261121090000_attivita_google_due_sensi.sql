-- =====================================================================================================
-- Google Tasks e Calendar nei due sensi.
-- Oltre a app → Google, il server riporta nell'app quello che la persona fa su Google:
--   - spunta/toglie la spunta in Google Tasks → attività completata/riaperta (con conferma di tutti: la sua parte);
--   - cambia la data in Tasks o sposta l'evento nel calendario → nuova scadenza (e ora, dal calendario);
--   - rinomina → nuovo titolo;
--   - aggiunge un task nella lista "Ricreo" o un evento nel calendario "Ricreo attività" → nuova attività
--     personale sua, assegnata a lei;
--   - elimina su Google un'attività personale creata da lei → cestino (le altre si ricreano su Google).
-- Per capire cosa ha cambiato la persona, google_sync ricorda com'era su Google l'ultima volta.
-- =====================================================================================================

set lock_timeout = '5s';

alter table tasks.google_account
  add column if not exists tasks_letti_at timestamptz,
  add column if not exists calendar_sync_token text;
comment on column tasks.google_account.tasks_letti_at is 'Ultima lettura della lista "Ricreo": dopo si leggono solo i task cambiati.';
comment on column tasks.google_account.calendar_sync_token is 'Token di Google Calendar per leggere solo gli eventi cambiati dall''ultima volta.';

alter table tasks.google_sync
  add column if not exists su_google_task jsonb,
  add column if not exists su_google_evento jsonb;
comment on column tasks.google_sync.su_google_task is 'Com''era il task su Google l''ultima volta (scritto o letto): {t titolo, d scadenza, f fatta}.';
comment on column tasks.google_sync.su_google_evento is 'Com''era l''evento su Google l''ultima volta: {t titolo, d giorno, o ora HH:MM o null}.';

-- Come prima, più le attività già legate a un task di Google Tasks anche senza scadenza (es. aggiunte dal
-- telefono senza data): restano nella lista "Ricreo", non nel calendario.
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
     and (t.scadenza is not null
          or exists (select 1 from tasks.google_sync s where s.utente_id = p_utente and s.task_id = t.id and s.google_task_id is not null))
     and t.eliminata_at is null and t.archiviata_at is null
     and (p.id is null or (p.eliminata_at is null and p.archiviata_at is null))
     and (t.completata_at is null or t.completata_at > now() - interval '30 days')
$$;

-- Cambi fatti dalla persona su Google, applicati come se li avesse fatti lei nell'app (storico, notifiche,
-- ricorrenze: tasks.attore). Solo attività assegnate a lei, non nel cestino né archiviate.
-- p_cambi: { titolo?, scadenza? (data o null), ora? ('HH:MM' o null), fatta?: boolean, elimina?: true }.
-- Ritorna i cambi applicati ({} = niente: il server riscrive su Google com'è nell'app).
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

-- Attività aggiunta dalla persona su Google (lista "Ricreo" o calendario "Ricreo attività"): personale, sua.
create or replace function tasks.google_crea(p_utente uuid, p_titolo text, p_scadenza date default null, p_ora time default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_titolo text := left(btrim(coalesce(p_titolo, '')), 300);
begin
  if v_titolo = '' then
    raise exception 'Titolo mancante.' using errcode = '22023';
  end if;
  if not exists (select 1 from public."User" u where u."authUserId" = p_utente and u."isActive") then
    raise exception 'Persona non attiva.' using errcode = '22023';
  end if;
  perform set_config('tasks.attore', p_utente::text, true);
  insert into tasks.task (titolo, scadenza, ora_scadenza, personale, creato_da, app_origine, ordine)
  values (v_titolo, p_scadenza, case when p_scadenza is not null then p_ora end, true, p_utente, 'Google', extract(epoch from now()))
  returning id into v_id;
  insert into tasks.assegnatari (task_id, user_id, ordine) values (v_id, p_utente, 1);
  return v_id;
end;
$$;

revoke all on function tasks.google_applica(uuid, uuid, jsonb), tasks.google_crea(uuid, text, date, time) from public, anon, authenticated;
grant execute on function tasks.google_applica(uuid, uuid, jsonb), tasks.google_crea(uuid, text, date, time) to service_role;
