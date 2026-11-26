// The Supabase project this repository's applications share. The publishable key is meant for browsers:
// row level security decides what a signed-in account can read and write. No other key belongs in this folder.
export const SUPABASE_URL = "https://hqqwlkmggwgaoiyzgrhy.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HmSmGVio0b9HQCBocjeuYA_eleacS3u";
/** The server-side route that holds the Anthropic key and calls Claude. */
export const ASSIST_URL = `${SUPABASE_URL}/functions/v1/proposal-assist`;
export const PURSUITS_TABLE = "proposal_pursuits";
