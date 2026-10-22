// CLI: apply migrations and load demo data into an empty database.
import { config } from "../src/config.js";
import { runMigrations } from "../src/migrate.js";
import { prisma } from "../src/stock.js";
import { seedDemo } from "../src/demo.js";

try {
  await runMigrations(prisma);
  if ((await prisma.store.count()) > 0) console.log(`Database ${config.dbPath} already contains data: seed skipped`);
  else await seedDemo();
} finally {
  await prisma.$disconnect();
}
