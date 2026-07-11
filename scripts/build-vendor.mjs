import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "assets/vendor/supabase-js-2.110.2.umd.js");
await mkdir(dirname(destination), { recursive:true });
await copyFile(resolve(root, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"), destination);
await copyFile(resolve(root, "node_modules/@supabase/supabase-js/LICENSE"), resolve(root, "assets/vendor/SUPABASE-LICENSE.txt"));
