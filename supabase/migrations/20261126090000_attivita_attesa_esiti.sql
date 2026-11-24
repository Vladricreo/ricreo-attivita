-- =====================================================================================================
-- Attività che non dipendono da te, chiuse senza farle, e revisione.
--
-- In attesa: un'attività aperta può aspettare qualcosa o qualcuno (attesa_motivo) con una data in cui
--   tornare a guardarla (ricontrolla_il). Non è uno stato della bacheca: vale in qualsiasi colonna, e
--   sparisce da sola quando l'attività viene fatta, chiusa o riparte (ricorrenti).
-- Esito: archiviare dice anche perché non si è fatta (annullata = non serve più; superata = le cose
--   sono andate diversamente da come ci si aspettava) e, se c'è, quale attività la sostituisce.
-- Revisione: rivista_at dice quando qualcuno l'ha riguardata e confermata, così non risulta «ferma».
-- Limite: quante attività «in corso» vuole tenere al massimo ogni persona (preferenze).
-- =====================================================================================================

set lock_timeout = '5s';

alter table tasks.task
  add column if not exists attesa_motivo text,
  add column if not exists attesa_dal timestamptz,
  add column if not exists attesa_da uuid,
  add column if not exists ricontrolla_il date,
  add column if not exists esito text,
  add column if not exists sostituita_da uuid references tasks.task (id) on delete set null,
  add column if not exists rivista_at timestamptz,
  add column if not exists rivista_da uuid;

alter table tasks.task drop constraint if exists task_attesa_check;
alter table tasks.task add constraint task_attesa_check check (
  (attesa_motivo is null or char_length(attesa_motivo) between 1 and 500)
  and (ricontrolla_il is null or attesa_motivo is not null)
);
alter table tasks.task drop constraint if exists task_esito_check;
alter table tasks.task add constraint task_esito_check check (
  (esito is null or (esito in ('annullata', 'superata') and archiviata_at is not null))
  and (sostituita_da is null or (sostituita_da <> id and archiviata_at is not null))
);

comment on column tasks.task.attesa_motivo is 'Cosa o chi si sta aspettando (null = non è in attesa).';
comment on column tasks.task.attesa_dal is 'Da quando è in attesa (lo scrive il trigger).';
comment on column tasks.task.ricontrolla_il is 'Giorno in cui tornare a guardarla: non è una scadenza.';
comment on column tasks.task.esito is 'Perché è stata archiviata senza farla: annullata (non serve più) o superata (è cambiata la situazione).';
comment on column tasks.task.sostituita_da is 'Attività che ha preso il posto di questa.';
comment on column tasks.task.rivista_at is 'Ultima volta che qualcuno l''ha riguardata e confermata (revisione).';

create index if not exists task_ricontrolla_idx on tasks.task (ricontrolla_il)
  where ricontrolla_il is not null and completata_at is null and archiviata_at is null and eliminata_at is null;
create index if not exists task_sostituita_idx on tasks.task (sostituita_da) where sostituita_da is not null;

alter table tasks.preferenze add column if not exists limite_in_corso smallint;
alter table tasks.preferenze drop constraint if exists preferenze_limite_check;
alter table tasks.preferenze add constraint preferenze_limite_check check (limite_in_corso is null or limite_in_corso between 1 and 50);
comment on column tasks.preferenze.limite_in_corso is 'Quante attività in corso la persona vuole tenere al massimo (null = predefinito dell''interfaccia).';

alter table tasks.notifiche drop constraint if exists notifiche_tipo_check;
alter table tasks.notifiche add constraint notifiche_tipo_check check (tipo in (
  'assegnata', 'menzione', 'commento', 'completata', 'stato', 'tocca_a_te', 'sottotask_finite', 'scadenza', 'riaperta',
  'sollecito', 'sollecito_forte', 'attesa', 'ricontrollo', 'chiusa'
));

-- =====================================================================================================
-- Trigger: gira dopo trg_task_prima (ordine alfabetico), quindi vede già completamento e archivio decisi.
-- =====================================================================================================

create or replace function tasks_private.task_attesa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attore uuid := tasks_private.attore();
begin
  if tg_op = 'INSERT' then
    -- Un'attività nasce aperta: attesa, esito e revisione arrivano dopo (job e import possono passarli).
    if auth.uid() is not null then
      new.attesa_motivo := null;
      new.esito := null;
      new.sostituita_da := null;
      new.rivista_at := null;
    end if;
    new.attesa_motivo := nullif(btrim(new.attesa_motivo), '');
    if new.attesa_motivo is null then
      new.attesa_dal := null;
      new.attesa_da := null;
      new.ricontrolla_il := null;
    else
      new.attesa_dal := coalesce(new.attesa_dal, now());
      new.attesa_da := coalesce(new.attesa_da, v_attore);
    end if;
    new.rivista_da := case when new.rivista_at is not null then coalesce(new.rivista_da, v_attore) end;
    return new;
  end if;

  -- In attesa ---------------------------------------------------------------------------------------
  new.attesa_motivo := nullif(btrim(new.attesa_motivo), '');
  -- Fatta, chiusa o ripartita (ricorrente): non aspetta più niente.
  if new.completata_at is not null or new.archiviata_at is not null
     or new.ultimo_completamento_at is distinct from old.ultimo_completamento_at then
    new.attesa_motivo := null;
  end if;
  if new.attesa_motivo is null then
    new.attesa_dal := null;
    new.attesa_da := null;
    new.ricontrolla_il := null;
  elsif old.attesa_motivo is null then
    new.attesa_dal := now();
    new.attesa_da := v_attore;
  else
    new.attesa_dal := old.attesa_dal;
    new.attesa_da := old.attesa_da;
  end if;

  -- Esito: vale solo finché è archiviata.
  if new.archiviata_at is null then
    new.esito := null;
    new.sostituita_da := null;
  end if;

  -- Revisione: data e autore li decide il database.
  if new.rivista_at is distinct from old.rivista_at then
    if new.rivista_at is not null then
      new.rivista_at := now();
      new.rivista_da := v_attore;
    else
      new.rivista_da := null;
    end if;
  else
    new.rivista_da := old.rivista_da;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_task_prima_attesa on tasks.task;
create trigger trg_task_prima_attesa
  before insert or update on tasks.task
  for each row execute function tasks_private.task_attesa();

-- Storico e notifiche: chi segue l'attività sa che è ferma in attesa, o che è stata chiusa senza farla.
create or replace function tasks_private.task_attesa_dopo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destinatari uuid[];
begin
  if tasks_private.silenzioso() then
    return null;
  end if;

  if new.attesa_motivo is not null
     and (old.attesa_motivo is null or new.attesa_motivo is distinct from old.attesa_motivo or new.ricontrolla_il is distinct from old.ricontrolla_il) then
    perform tasks_private.scrivi_storico(new.id, 'attesa', jsonb_build_object('motivo', new.attesa_motivo, 'ricontrolla', new.ricontrolla_il));
    if old.attesa_motivo is null then
      select array_agg(distinct x) into v_destinatari from (
        select o.user_id as x from tasks.osservatori o where o.task_id = new.id
        union all select a.user_id from tasks.assegnatari a where a.task_id = new.id
      ) q;
      perform tasks_private.notifica(v_destinatari, 'attesa', new.id, new.attesa_motivo);
    end if;
  elsif new.attesa_motivo is null and old.attesa_motivo is not null
        and new.completata_at is null and new.archiviata_at is null
        and new.ultimo_completamento_at is not distinct from old.ultimo_completamento_at then
    perform tasks_private.scrivi_storico(new.id, 'ripresa');
  end if;

  if new.esito is not null and old.archiviata_at is null and new.archiviata_at is not null then
    select array_agg(distinct x) into v_destinatari from (
      select o.user_id as x from tasks.osservatori o where o.task_id = new.id
      union all select a.user_id from tasks.assegnatari a where a.task_id = new.id
    ) q;
    perform tasks_private.notifica(v_destinatari, 'chiusa', new.id, new.archivio_motivo);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_task_dopo_attesa on tasks.task;
create trigger trg_task_dopo_attesa
  after update on tasks.task
  for each row execute function tasks_private.task_attesa_dopo();

revoke execute on function tasks_private.task_attesa(), tasks_private.task_attesa_dopo() from public, anon, authenticated;

-- =====================================================================================================
-- Promemoria del giorno di ricontrollo. Lo chiama un job con la secret key (una volta al giorno o più:
-- non avvisa due volte per la stessa data). Avvisa chi l'ha messa in attesa e chi la deve fare.
-- =====================================================================================================

create or replace function tasks.avvisa_ricontrolli()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_destinatari uuid[];
  n integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo i job possono mandare i promemoria.' using errcode = '42501';
  end if;
  for r in
    select t.id, t.attesa_da, t.attesa_motivo, t.ricontrolla_il
    from tasks.task t
    where t.ricontrolla_il is not null and t.ricontrolla_il <= tasks_private.oggi()
      and t.completata_at is null and t.archiviata_at is null and t.eliminata_at is null
      and not exists (
        select 1 from tasks.notifiche x
        where x.task_id = t.id and x.tipo = 'ricontrollo' and (x.creata_at at time zone 'Europe/Rome')::date >= t.ricontrolla_il
      )
  loop
    select array_agg(distinct x) into v_destinatari from (
      select r.attesa_da as x
      union all select a.user_id from tasks.assegnatari a where a.task_id = r.id
    ) q;
    perform tasks_private.notifica(v_destinatari, 'ricontrollo', r.id, r.attesa_motivo);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function tasks.avvisa_ricontrolli() from public, anon, authenticated;
grant execute on function tasks.avvisa_ricontrolli() to service_role;

-- =====================================================================================================
-- Vista: le colonne nuove in coda (create or replace non permette di cambiare l'ordine di quelle che c'erano).
-- =====================================================================================================

create or replace view tasks.v_task
with (security_invoker = true) as
select t.id, t.radice_id, t.padre_id, t.ordine, t.categoria_id, t.sottocategoria_id, t.titolo, t.descrizione, t.stato_id, t.priorita,
       t.data_inizio, t.scadenza, t.ora_scadenza, t.stima_minuti, t.ricorrenza_unita, t.ricorrenza_intervallo, t.ricorrenza_fine,
       t.ricorrenza_giorno, t.preavviso_giorni, t.personale, t.in_sequenza, t.conferma_tutti, t.copertina_id, t.servizio, t.link,
       t.app_origine, t.dati, t.legacy_id, t.creato_da, t.creato_at, t.aggiornato_at, t.aggiornato_da, t.completata_at, t.completata_da,
       t.ultimo_completamento_at, t.archiviata_at, t.archiviata_da, t.archivio_motivo, t.automatizzata_da, t.eliminata_at, t.eliminata_da,
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
       (select count(*)::integer from tasks.completamenti k where k.task_id = t.id) as n_completamenti,
       t.attesa_motivo, t.attesa_dal, t.attesa_da, t.ricontrolla_il, t.esito, t.sostituita_da, t.rivista_at, t.rivista_da
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
