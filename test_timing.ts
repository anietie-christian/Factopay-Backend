import { execSync } from 'child_process';
const start = Date.now();
try {
  execSync('REDIS_HOST=127.0.0.1 npx jest src/modules/wallet-ledger/__tests__/e2e.spec.ts -t "should execute full transfer-engine to ledger e2e"');
} catch (e) {
  console.log(e.stdout.toString());
}
console.log(`First run took ${Date.now() - start}ms`);
const start2 = Date.now();
try {
  execSync('REDIS_HOST=127.0.0.1 npx jest src/modules/wallet-ledger/__tests__/e2e.spec.ts -t "should execute full transfer-engine to ledger e2e"');
} catch (e) {
  console.log(e.stdout.toString());
}
console.log(`Second run took ${Date.now() - start2}ms`);
