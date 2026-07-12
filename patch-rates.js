const fs = require('fs');
const file = 'src/modules/transfer-engine/infrastructure/controllers/rates.controller.ts';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('UseGuards')) {
  code = code.replace("import { Controller,", "import { Controller, UseGuards,");
  code = code.replace("import { ApiTags,", "import { AuthGuard } from '@nestjs/passport';\nimport { ApiTags, ApiBearerAuth,");
  code = code.replace("@Controller('rates')", "@ApiBearerAuth()\n@UseGuards(AuthGuard('jwt'))\n@Controller('rates')");
  fs.writeFileSync(file, code);
  console.log('Patched');
} else {
  console.log('Already patched');
}
