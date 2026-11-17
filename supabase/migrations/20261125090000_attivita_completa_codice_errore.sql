-- =====================================================================================================
-- tasks.completa: "già completata" non usa più il codice 40001.
--
-- 40001 è il codice dei conflitti di concorrenza (serialization_failure). PostgREST lo prende per un
-- errore passeggero e riesegue la transazione: su un'attività già completata l'errore torna uguale ogni
-- volta, quindi la richiesta gira senza fine e tiene occupata una connessione (17/11/2026: una decina di
-- richieste hanno portato il database al 100% di CPU per ore).
--
-- Regola: nelle funzioni chiamate dall'API gli errori di regola usano P0001 o un codice proprio, mai
-- quelli della classe 40.
-- =====================================================================================================

create or replace function tasks.completa(p_id uuid)
returns jsonb
language plpgsql
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
    raise exception 'Attività già completata da qualcun altro.' using errcode = 'P0001';
  end if;
  update tasks.task set stato_id = v_fatto where id = p_id returning * into t;
  return jsonb_build_object('chiusa', t.completata_at is not null, 'prossima_scadenza',
                            case when t.completata_at is null then t.scadenza end);
end;
$$;
