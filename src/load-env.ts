// Load .env.local (and .env) for standalone entrypoints (dev-poller, scripts).
// MUST be the first import of an entrypoint: bundlers hoist imports above
// regular statements, so dotenv.config() in a module body would run too late.
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
