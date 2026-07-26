/**
 * OpenNext adapter config for Cloudflare Workers.
 *
 * The app has no database, no filesystem writes and no incremental cache to
 * speak of — the landing page is static and the three Gemini routes are
 * `force-dynamic` — so the defaults are left alone rather than wiring an R2 or
 * KV cache this workload would never read.
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
