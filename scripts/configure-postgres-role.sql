\set ON_ERROR_STOP on

\if :{?app_role}
\else
\echo 'Missing required psql variable: app_role'
\quit 3
\endif

\if :{?connection_limit}
\else
\set connection_limit 20
\endif

SELECT :'connection_limit' ~ '^[1-9][0-9]*$' AS valid_connection_limit
\gset

\if :valid_connection_limit
\else
\echo 'connection_limit must be a positive integer'
\quit 3
\endif

SELECT format(
  'ALTER ROLE %I CONNECTION LIMIT %s',
  :'app_role',
  :'connection_limit'::integer
) AS command
\gexec

SELECT rolname, rolconnlimit
FROM pg_roles
WHERE rolname = :'app_role';
