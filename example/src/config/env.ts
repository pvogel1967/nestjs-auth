import { z } from 'zod';

/**
 * Every setting the app needs, validated once at startup by ConfigModule.
 * There are no fallbacks in code: locally they come from `.env` (copied from
 * `sample.env`), and in production from the real environment.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  // 127.0.0.1 in sample.env; listening on every interface means setting 0.0.0.0 explicitly
  HOST: z.string().min(1),
  SEARCH_INDEXER_SECRET: z.string().min(16),
  AUTHX_DEBUG: z.stringbool().default(false),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid configuration (for local development, copy sample.env to .env):\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
