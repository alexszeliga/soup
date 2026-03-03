import { createDatabase } from './packages/database/src/client.js';
import { tasks } from './packages/database/src/schema.js';
import { ConfigLoader } from './packages/core/src/Config.js';

const config = ConfigLoader.load();
console.log('Running Config:', {
  QB_DOWNLOAD_ROOT: config.QB_DOWNLOAD_ROOT,
  LOCAL_DOWNLOAD_ROOT: config.LOCAL_DOWNLOAD_ROOT
});

const db = createDatabase('apps/server/soup.db');

async function check() {
  const all = await db.select().from(tasks);
  if (all.length > 0) {
    const last = all[all.length - 1];
    console.log('Last Task Status:', last.status);
    console.log('Error Message:', last.errorMessage);
    console.log('File Map (First entry):', Object.keys(JSON.parse(last.fileMap))[0]);
  }
}

check().catch(console.error);
