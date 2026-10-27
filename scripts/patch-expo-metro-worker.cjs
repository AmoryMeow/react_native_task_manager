const fs = require("node:fs");

const supportedMetroConfigVersion = "57.0.13";
const metroConfigPackagePath = require.resolve(
  "@expo/metro-config/package.json",
);
const serializerPath = require.resolve(
  "@expo/metro-config/build/serializer/serializeChunks.js",
);
const metroConfigVersion = JSON.parse(
  fs.readFileSync(metroConfigPackagePath, "utf8"),
).version;
const workerBranch = `            else if (asyncType &&
                // Workers require standalone bundles even when ordinary chunk splitting is disabled.
                (isWorker || splitChunks)) {
                const asyncChunks = gatherChunks(`;
const workerFix = `                if (isWorker && options.includeAsyncPaths) {
                    continue;
                }`;
const patchedWorkerBranch = `            else if (asyncType &&
                // Workers require standalone bundles even when ordinary chunk splitting is disabled.
                (isWorker || splitChunks)) {
                // Backport of expo/expo#50244 for Expo SDK 57 development bundles.
${workerFix}
                const asyncChunks = gatherChunks(`;

const serializer = fs.readFileSync(serializerPath, "utf8");

// Newer Metro versions may already contain the upstream fix. In that case this
// script intentionally becomes a no-op, even when the package version changes.
if (serializer.includes(workerFix)) {
  console.log("Expo Metro web worker fix is already present.");
  process.exit(0);
}

if (metroConfigVersion !== supportedMetroConfigVersion) {
  throw new Error(
    `Refusing to patch @expo/metro-config ${metroConfigVersion}. ` +
      `This backport is verified only for ${supportedMetroConfigVersion}. ` +
      "Check whether the installed version already includes expo/expo#50244.",
  );
}

const workerBranchCount = serializer.split(workerBranch).length - 1;

if (workerBranchCount !== 1) {
  throw new Error(
    `Expected one Metro worker serialization branch, found ${workerBranchCount}. ` +
      "The dependency source does not match the verified SDK 57 implementation.",
  );
}

const patchedSerializer = serializer.replace(workerBranch, patchedWorkerBranch);

if (!patchedSerializer.includes(workerFix)) {
  throw new Error("Expo Metro worker patch verification failed before writing.");
}

fs.writeFileSync(serializerPath, patchedSerializer);

console.log("Applied Expo Metro web worker development fix.");
