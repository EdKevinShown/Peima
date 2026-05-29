/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: "\\.spec\\.ts$",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  /** Tests spy on `runAiSimulationV1JobExecution`; compiled CJS from dist has non-configurable exports. */
  moduleNameMapper: {
    "^@peima/ai-simulation-v1-runner$":
      "<rootDir>/../../packages/ai-simulation-v1-runner/src/index.ts",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
};
