const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const generator = path.join(__dirname, 'generate-collection.js');
const committed = path.join(repoRoot, 'postman', 'ParaBank_API_Tests.postman_collection.json');
const generated = path.join(os.tmpdir(), `parabank-collection-${process.pid}.json`);

try {
  execFileSync(process.execPath, [generator, generated], { stdio: 'pipe' });

  const expected = fs.readFileSync(committed, 'utf8');
  const actual = fs.readFileSync(generated, 'utf8');

  if (expected !== actual) {
    console.error('Generated Postman collection is out of date.');
    console.error('Run `npm run generate` and commit the updated collection.');
    process.exitCode = 1;
  } else {
    console.log('Generated collection is up to date.');
  }
} finally {
  if (fs.existsSync(generated)) fs.unlinkSync(generated);
}
