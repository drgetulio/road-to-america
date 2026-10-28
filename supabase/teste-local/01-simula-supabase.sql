-- Só para teste local (Postgres puro, sem Supabase). NÃO rode no projeto do Supabase.
-- Uso: createdb r2a && psql -d r2a -f 01-simula-supabase.sql -f ../schema.sql -f 02-testa-rls.sql
-- Simula o mínimo do Supabase: esquema auth, auth.uid() e papéis
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
