import { closeDatabase } from '../config/database.js';
import { companyProviderService } from '../messaging/company-provider.service.js';

async function main() {
  const rows = await companyProviderService.listProviderInventory();
  console.table(rows);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
