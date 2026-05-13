import { ensureDatabaseSchema } from './schema';

ensureDatabaseSchema({ closePool: true }).catch((err) => {
  console.error(err);
  process.exit(1);
});
