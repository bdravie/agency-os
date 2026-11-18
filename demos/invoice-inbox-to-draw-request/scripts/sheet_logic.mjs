// Runs one function from apps-script/Logic.gs in Node, so the local runner and the tests use the exact
// rules the Google Sheet runs. Reads {"fn": "...", "args": [...]} as JSON on stdin, prints the result as JSON.
// Also importable: `import { logic } from './sheet_logic.mjs'`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadLogic() {
  const code = readFileSync(path.join(here, '..', 'apps-script', 'Logic.gs'), 'utf8');
  // Wrapped like a CommonJS module and run in this context, so arrays and Dates are ordinary ones.
  const mod = { exports: {} };
  vm.runInThisContext(`(function (module) {\n${code}\n})`, { filename: 'Logic.gs', lineOffset: -1 })(mod);
  return mod.exports;
}

export const logic = loadLogic();

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const job = JSON.parse(readFileSync(0, 'utf8'));
  const fn = logic[job.fn];
  if (typeof fn !== 'function') {
    // Constants (DEMO_PROJECTS, DEMO_TEMPLATE, ...) are returned as they are.
    if (job.fn in logic) { process.stdout.write(JSON.stringify(logic[job.fn])); process.exit(0); }
    console.error(`No function ${job.fn} in Logic.gs`);
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(fn(...(job.args || []))));
}
