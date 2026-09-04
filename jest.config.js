/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // No .spec.ts files exist yet; without this Jest exits non-zero on an
  // empty suite, which would make `npm test` fail for a reason unrelated
  // to actual test results. Drop this once real tests are added.
  passWithNoTests: true,
};
