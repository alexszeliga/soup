import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Zod schema for Soup application configuration.
 * Defines all environment variables, their types, and default values.
 */
const configSchema = z.object({
  // Server Configuration
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // qBittorrent Configuration
  QB_URL: z.string().url().default('https://qb.osage.lol/api/v2'),
  QB_USERNAME: z.string().optional(),
  QB_PASSWORD: z.string().optional(),
  
  // TMDB Configuration
  TMDB_API_KEY: z.string().min(1, "TMDB_API_KEY is required"),
  TMDB_BASE_URL: z.string().url().default('https://api.themoviedb.org/3'),
  TMDB_IMAGE_BASE_URL: z.string().url().default('https://image.tmdb.org/t/p/w500'),
  
  // Persistence
  DB_PATH: z.string().default('./soup.db'),
  
  // App Logic
  SYNC_INTERVAL_MS: z.coerce.number().default(2000),
  MEDIA_ROOT: z.string().default('./media'),
  QB_DOWNLOAD_ROOT: z.string().default('/downloads'),
  LOCAL_DOWNLOAD_ROOT: z.string().default('./downloads'),
  WEB_DIST_PATH: z.string().default('../web/dist'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('warn'),
});

/**
 * Infer the TypeScript type from the Zod schema.
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Singleton class responsible for loading, validating, and providing 
 * access to the application configuration.
 */
export class ConfigLoader {
  private static instance: Config;

  /**
   * Loads configuration from environment variables and .env files.
   * 
   * @param dotEnvPath - Optional explicit path to a .env file.
   * @returns Validated configuration object.
   * @throws {ZodError} If validation fails.
   */
  public static load(dotEnvPath?: string): Config {
    if (this.instance) return this.instance;

    // The .env file is always expected at the project root
    const rootEnv = dotEnvPath || path.resolve(__dirname, '../../../.env');
    dotenv.config({ path: rootEnv });

    const result = configSchema.safeParse(process.env);

    if (!result.success) {
      console.error('❌ Invalid configuration:');
      console.error(result.error.flatten().fieldErrors);
      throw new Error('Invalid environment variables');
    }

    this.instance = result.data;
    return this.instance;
  }

  /**
   * Returns a version of the config safe for exposure to the web client.
   * 
   * @param config - The full server config.
   * @returns Subset of config without secrets.
   */
  public static getClientConfig(config: Config) {
    return {
      syncInterval: config.SYNC_INTERVAL_MS,
      tmdbImageBase: config.TMDB_IMAGE_BASE_URL,
      env: config.NODE_ENV,
    };
  }
}
