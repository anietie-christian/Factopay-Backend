const fs = require('fs');
const file = 'src/modules/gateway-integrations/gateway-integrations.module.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('bullBoardAuthMiddleware')) {
  code = code.replace(
    "import { webhookBackoffStrategy } from './infrastructure/bullmq/custom-backoff';",
    "import { webhookBackoffStrategy } from './infrastructure/bullmq/custom-backoff';\nimport { bullBoardAuthMiddleware } from './infrastructure/middleware/bull-board-auth.middleware';"
  );
  
  code = code.replace(
    "route: '/api/v1/admin/queues',",
    "route: '/api/v1/admin/queues',\n      middleware: [bullBoardAuthMiddleware],"
  );
  
  fs.writeFileSync(file, code);
  console.log('Patched bull module');
} else {
  console.log('Already patched');
}
