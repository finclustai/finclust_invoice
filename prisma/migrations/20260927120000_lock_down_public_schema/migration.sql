-- Supabase auto-generates a REST API (PostgREST) over the `public` schema and
-- serves it to the `anon` role using the anon key -- a key that is published in
-- browser code by design. Our tables hold customer GSTINs, bank details and
-- invoice amounts, and every legitimate read already goes through Prisma as the
-- `postgres` role, so nothing of ours needs `anon` or `authenticated` at all.
--
-- Revoking schema USAGE is what actually closes the door: without it, enabling
-- row-level security per table would leave any table someone forgets to cover
-- wide open. This way the default is closed and a future table inherits it.
--
-- `postgres` (Prisma) and `service_role` (Storage, later) are untouched.
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all tables in schema public from %I', role_name);
      execute format('revoke all on all sequences in schema public from %I', role_name);
      execute format('revoke all on all functions in schema public from %I', role_name);
      execute format('revoke usage on schema public from %I', role_name);
      -- Covers tables created by later migrations, not just today's.
      execute format('alter default privileges in schema public revoke all on tables from %I', role_name);
      execute format('alter default privileges in schema public revoke all on sequences from %I', role_name);
    end if;
  end loop;
end $$;
