/**
 * Checks databaseNameFromUri against the connection-string shapes Atlas hands
 * out. The no-database form is the one that caused a deploy to come up healthy
 * while every collection read empty, so it is worth a test.
 */
import { databaseNameFromUri } from '../db/mongo.js';

const CASES: [string, string | null][] = [
  ['mongodb+srv://u:p@c.mongodb.net/zahiri?retryWrites=true&w=majority', 'zahiri'],
  ['mongodb+srv://u:p@c.mongodb.net/zahiri', 'zahiri'],
  ['mongodb+srv://u:p@c.mongodb.net?retryWrites=true', null],
  ['mongodb+srv://u:p@c.mongodb.net', null],
  ['mongodb+srv://u:p@c.mongodb.net/?retryWrites=true', null],
  ['mongodb+srv://u:p@c.mongodb.net/', null],
  ['mongodb://localhost:27017/zahiri', 'zahiri'],
  ['mongodb://localhost:27017', null],
];

let failures = 0;

for (const [uri, expected] of CASES) {
  const actual = databaseNameFromUri(uri);
  const ok = actual === expected;
  if (!ok) failures += 1;
  const redacted = uri.replace(/\/\/[^@]*@/, '//***@');
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${redacted.padEnd(52)} -> ${JSON.stringify(actual)}` +
      (ok ? '' : ` (expected ${JSON.stringify(expected)})`),
  );
}

console.log(failures === 0 ? '\nall cases pass' : `\n${failures} case(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
