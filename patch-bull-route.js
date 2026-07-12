const fs = require('fs');
const file = 'src/modules/gateway-integrations/gateway-integrations.module.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace("route: '/api/v1/admin/queues'", "route: '/admin/queues'");
fs.writeFileSync(file, code);
console.log('Patched');
