-- Ruoli Admin e Manager decisi dalla pagina Attività (Impostazioni → Ruoli e responsabili).
-- I ruoli sono quelli condivisi da tutte le app (public."Role"/"UserRole"): solo un admin li cambia,
-- e solo Admin e Manager. Non si toglie l'Admin a se stessi né all'ultimo admin attivo.
-- Togliere Manager toglie anche le persone che seguiva (tasks.manager_persone).

create or replace function tasks.imposta_ruolo(p_persona uuid, p_ruolo text, p_si boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_user integer;
  v_ruolo uuid;
begin
  if v_me is null or not tasks_private.e_admin() then
    raise exception 'Solo un admin può cambiare i ruoli' using errcode = '42501';
  end if;
  if p_ruolo not in ('Admin', 'Manager') then
    raise exception 'Qui si danno solo i ruoli Admin e Manager' using errcode = '22023';
  end if;
  select u.id into v_user from public."User" u where u."authUserId" = p_persona;
  if v_user is null then
    raise exception 'Persona non trovata' using errcode = '22023';
  end if;
  select r.id into v_ruolo from public."Role" r where r.name = p_ruolo;
  if v_ruolo is null then
    raise exception 'Ruolo % non trovato', p_ruolo using errcode = '22023';
  end if;

  if p_si then
    insert into public."UserRole" ("userId", "roleId") values (v_user, v_ruolo) on conflict do nothing;
    return;
  end if;

  if p_ruolo = 'Admin' then
    if p_persona = v_me then
      raise exception 'Non puoi toglierti da solo il ruolo Admin' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public."UserRole" ur join public."User" u on u.id = ur."userId"
      where ur."roleId" = v_ruolo and u."isActive" and u.id <> v_user
    ) then
      raise exception 'Serve almeno un admin attivo' using errcode = '22023';
    end if;
  end if;

  delete from public."UserRole" where "userId" = v_user and "roleId" = v_ruolo;
  if p_ruolo = 'Manager' then
    delete from tasks.manager_persone where manager_id = p_persona;
  end if;
end;
$$;

comment on function tasks.imposta_ruolo(uuid, text, boolean) is 'Admin: dà o toglie il ruolo Admin/Manager (condiviso da tutte le app). Togliere Manager toglie anche le persone seguite.';

revoke all on function tasks.imposta_ruolo(uuid, text, boolean) from public, anon;
grant execute on function tasks.imposta_ruolo(uuid, text, boolean) to authenticated;
