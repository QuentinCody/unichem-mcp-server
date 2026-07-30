#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertContains(filePath, haystack, needle, testName) {
  totalTests++;
  if (haystack.includes(needle)) {
    console.log(`${GREEN}✓${RESET} ${testName}`);
    passedTests++;
  } else {
    console.log(`${RED}✗${RESET} ${testName}`);
    console.log(`  Missing: ${needle}`);
    console.log(`  File: ${filePath}`);
    failedTests++;
  }
}

function readFile(relPath) {
  const absPath = path.resolve(SERVER_ROOT, relPath);
  return fs.readFileSync(absPath, 'utf8');
}

console.log(`${BLUE}🧪 UniChem Structured Content Regression Tests${RESET}`);

// Code Mode tools use the shared createSearchTool / createExecuteTool factories
// which emit content + structuredContent internally. We verify file topology
// and catalog invariants at static-analysis time (mirrors the hpa template).

const codeModeContent = readFile('src/tools/code-mode.ts');
assertContains('src/tools/code-mode.ts', codeModeContent, 'createSearchTool', 'code-mode.ts uses createSearchTool');
assertContains('src/tools/code-mode.ts', codeModeContent, 'createExecuteTool', 'code-mode.ts uses createExecuteTool');
assertContains('src/tools/code-mode.ts', codeModeContent, 'unichem', 'code-mode.ts uses prefix "unichem"');

const queryDataContent = readFile('src/tools/query-data.ts');
assertContains('src/tools/query-data.ts', queryDataContent, 'createQueryDataHandler', 'query-data.ts uses createQueryDataHandler');
assertContains('src/tools/query-data.ts', queryDataContent, 'unichem_query_data', 'query-data.ts registers unichem_query_data');

const getSchemaContent = readFile('src/tools/get-schema.ts');
assertContains('src/tools/get-schema.ts', getSchemaContent, 'createGetSchemaHandler', 'get-schema.ts uses createGetSchemaHandler');
assertContains('src/tools/get-schema.ts', getSchemaContent, 'unichem_get_schema', 'get-schema.ts registers unichem_get_schema');

const indexContent = readFile('src/index.ts');
assertContains('src/index.ts', indexContent, 'UnichemDataDO', 'index.ts exports UnichemDataDO');
assertContains('src/index.ts', indexContent, 'StatelessMcpWorker', 'index.ts uses StatelessMcpWorker');
assertContains('src/index.ts', indexContent, 'UNICHEM_DATA_DO', 'index.ts references UNICHEM_DATA_DO binding');

const catalogContent = readFile('src/spec/catalog.ts');
assertContains('src/spec/catalog.ts', catalogContent, 'https://www.ebi.ac.uk/unichem/api/v1', 'catalog.ts uses correct base URL');
// The overlap sentence required by §3.2 of the plan MUST be present verbatim.
assertContains(
  'src/spec/catalog.ts',
  catalogContent,
  'Complements BioThings MyChem',
  'catalog.ts description includes BioThings MyChem overlap note',
);
assertContains(
  'src/spec/catalog.ts',
  catalogContent,
  'KEGG Compound, HMDB, ZINC, GtoPdb ligands, BindingDB, SureChEMBL, or DrugCentral',
  'catalog.ts description lists the expected complementary sources',
);
// The trailing-slash quirk must be baked into every GET collection path per plan §5.2.
assertContains('src/spec/catalog.ts', catalogContent, '/sources/', 'catalog.ts /sources/ path has trailing slash');
assertContains('src/spec/catalog.ts', catalogContent, '/sources/{src_id}/', 'catalog.ts /sources/{src_id}/ path has trailing slash');
assertContains('src/spec/catalog.ts', catalogContent, '/inchi-key/{inchi_key}/', 'catalog.ts /inchi-key/{inchi_key}/ path has trailing slash');
assertContains('src/spec/catalog.ts', catalogContent, '/inchi/{standard_inchi}/', 'catalog.ts /inchi/{standard_inchi}/ path has trailing slash');

// Minimum 6 endpoints per plan §5.2 (verify by counting `method:` occurrences).
const endpointCount = (catalogContent.match(/method:\s*"/g) || []).length;
totalTests++;
if (endpointCount >= 6) {
  console.log(`${GREEN}✓${RESET} catalog.ts has >= 6 endpoints (found ${endpointCount})`);
  passedTests++;
} else {
  console.log(`${RED}✗${RESET} catalog.ts has < 6 endpoints (found ${endpointCount})`);
  failedTests++;
}

const apiAdapterContent = readFile('src/lib/api-adapter.ts');
assertContains('src/lib/api-adapter.ts', apiAdapterContent, 'createUnichemApiFetch', 'api-adapter.ts exports createUnichemApiFetch');
assertContains('src/lib/api-adapter.ts', apiAdapterContent, 'unichemPost', 'api-adapter.ts handles POST via unichemPost');

const httpContent = readFile('src/lib/http.ts');
assertContains('src/lib/http.ts', httpContent, 'https://www.ebi.ac.uk/unichem/api/v1', 'http.ts uses correct base URL');

const wranglerContent = readFile('wrangler.jsonc');
assertContains('wrangler.jsonc', wranglerContent, '"unichem-mcp-server"', 'wrangler.jsonc has correct server name');
assertContains('wrangler.jsonc', wranglerContent, '"port": 8895', 'wrangler.jsonc uses port 8895');
assertContains('wrangler.jsonc', wranglerContent, '"UnichemDataDO"', 'wrangler.jsonc binds UnichemDataDO class');
assertContains('wrangler.jsonc', wranglerContent, '"UNICHEM_DATA_DO"', 'wrangler.jsonc names UNICHEM_DATA_DO binding');
assertContains('wrangler.jsonc', wranglerContent, '"CODE_MODE_LOADER"', 'wrangler.jsonc has CODE_MODE_LOADER worker_loader');
assertContains('wrangler.jsonc', wranglerContent, '"alias"', 'wrangler.jsonc has ai-stub alias');

console.log(`\n${BLUE}📊 Test Results Summary${RESET}`);
console.log(`Total tests: ${totalTests}`);
console.log(`${GREEN}Passed: ${passedTests}${RESET}`);
console.log(`${RED}Failed: ${failedTests}${RESET}`);

if (failedTests > 0) {
  console.log(`\n${RED}❌ Regression tests failed.${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}✅ UniChem structured content regression tests passed.${RESET}`);
