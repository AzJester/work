-- Seed the owner account into the AI allowlist so the owner can never be
-- locked out of the AI endpoints on their own deployment. The edge functions
-- (supabase/functions/_shared/ai-edge.ts) union this table with the
-- AI_ALLOWED_EMAILS secret; before this row, the owner's access depended
-- entirely on that secret being set and spelled correctly — if it drifted,
-- the owner saw "This account is not allowed to use …" like any stranger.
-- The email is the same OWNER_EMAIL already published in roadmap.html, and
-- RLS keeps this table invisible to client roles.
insert into public.ai_allowed_emails (email, feature, note) values
  ('shane0372@gmail.com', 'ALL', 'Owner account — always allowed')
on conflict (email, feature) do nothing;
