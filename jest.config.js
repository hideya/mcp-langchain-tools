export default {
  // handle ESM
  preset: "ts-jest/presets/default-esm",  // Use ESM preset instead of 'ts-jest'
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],  // Handle TypeScript files as ESM
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",  // Handle ESM imports with .js extensions
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true
      },
    ],
  },
  transformIgnorePatterns: [],
  testMatch: ["**/tests/**/*.test.ts"],
  resolver: 'jest-ts-webcompat-resolver',
};
