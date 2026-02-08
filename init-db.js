#!/usr/bin/env node
const { Database } = require('./scraper/src/db.js');

async function main() {
  const db = new Database('postgresql://housewipe:localdev123@localhost:5432/housewipe');
  await db.init();
  await db.close();
  console.log('✅ Database initialized!');
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
