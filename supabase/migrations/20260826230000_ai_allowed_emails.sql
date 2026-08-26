-- Database-backed AI allowlist, unioned with the AI_ALLOWED_EMAILS secret by
-- supabase/functions/_shared/ai-edge.ts. A row grants one endpoint (the
-- function's envPrefix, e.g. ROADMAP_SUMMARY) or every endpoint ('ALL').
-- Only the service role can read it: RLS is enabled with no policies and the
-- client roles hold no grants, so the allowlist is invisible to browsers.
create table if not exists public.ai_allowed_emails (
  email text not null check (email = lower(email) and position('@' in email) > 1),
  feature text not null default 'ALL' check (feature = upper(feature)),
  note text,
  created_at timestamptz not null default now(),
  primary key (email, feature)
);

alter table public.ai_allowed_emails enable row level security;
revoke all on table public.ai_allowed_emails from public, anon, authenticated;

comment on table public.ai_allowed_emails is
  'Accounts allowed to call the AI Edge Functions, unioned with the AI_ALLOWED_EMAILS secret; feature matches a function envPrefix or ALL.';

insert into public.ai_allowed_emails (email, feature, note) values
  ('james.sullivan@astrion.us', 'ROADMAP_SUMMARY', 'Roadmap AI narrative writer'),
  ('christopher.leslie@astrion.us', 'ROADMAP_SUMMARY', 'Roadmap AI narrative writer')
on conflict (email, feature) do nothing;
