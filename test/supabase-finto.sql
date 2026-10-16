-- Supabase finto per provare lo schema tasks in PGlite.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema app_auth;
create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on all functions in schema auth to public;
create table public."User" (id serial primary key, email text, username text, name text, "isActive" boolean default true, "authUserId" uuid unique);
create table public."Profile" (id serial primary key, "userId" int unique, "avatarUrl" text);
create table public."Role" (id uuid primary key default gen_random_uuid(), name text unique);
create table public."UserRole" ("userId" int, "roleId" uuid, primary key ("userId", "roleId"));
create table public."RicreoApp" (id uuid primary key default gen_random_uuid(), slug text unique, name text, url text, "logoUrl" text, "isActive" boolean default true, "sortOrder" int default 0);
create table public."RicreoAppAccess" ("userId" int, "appId" uuid, primary key ("userId", "appId"));
create function app_auth.has_role(p text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public."User" u join public."UserRole" ur on ur."userId" = u.id join public."Role" r on r.id = ur."roleId"
                 where u."authUserId" = auth.uid() and u."isActive" and r.name = p) $$;
grant usage on schema app_auth to authenticated;
grant execute on function app_auth.has_role(text) to authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
create publication supabase_realtime;

-- Persone: anna/bruno admin, carla manager, dario e elena operatori.
insert into public."Role" (name) values ('Admin'), ('Manager'), ('Finance'), ('Operatore');
insert into public."RicreoApp" (slug, name, "sortOrder") values ('finance', 'Finance', 3), ('inventory', 'Inventory', 1), ('print-farm', 'Print farm', 2), ('product-console', 'PC', 4);
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-00000000000e');
insert into public."User" (name, username, "authUserId") values
  ('Anna', 'anna', '00000000-0000-0000-0000-00000000000a'),
  ('Bruno', 'bruno', '00000000-0000-0000-0000-00000000000b'),
  ('Carla', 'carla', '00000000-0000-0000-0000-00000000000c'),
  ('Dario', 'dario', '00000000-0000-0000-0000-00000000000d'),
  ('Elena', 'elena', '00000000-0000-0000-0000-00000000000e');
insert into public."UserRole" select u.id, r.id from public."User" u, public."Role" r
  where (u.username in ('anna', 'bruno') and r.name in ('Admin', 'Finance'))
     or (u.username = 'carla' and r.name in ('Manager', 'Finance'))
     or (u.username in ('dario', 'elena') and r.name = 'Operatore');
insert into public."RicreoAppAccess" select u.id, a.id from public."User" u, public."RicreoApp" a
  where u.username in ('anna', 'bruno', 'carla') or (u.username in ('dario', 'elena') and a.slug in ('inventory', 'print-farm'));
