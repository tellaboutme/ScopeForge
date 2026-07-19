import { execSync } from "node:child_process";

const checks = [
  ["Node", "node --version"],
  ["npm", "npm --version"],
  ["Python", "python --version"],
  ["Docker", "docker --version"],
];

let failed = false;
for (const [name, command] of checks) {
  try {
    const output = execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    console.log(`PASS ${name}: ${output}`);
  } catch {
    failed = true;
    console.error(`FAIL ${name}: ${command}`);
  }
}
process.exitCode = failed ? 1 : 0;
