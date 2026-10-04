import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = new URL("../", import.meta.url).pathname;
const outputRoot = join(projectRoot, "dist");
const files = ["index.html", "support.js", "src", "_ds"];

await rm(outputRoot, { force: true, recursive: true });
await mkdir(outputRoot, { recursive: true });

for (const file of files) {
  await cp(join(projectRoot, file), join(outputRoot, file), { recursive: true });
}

await writeFile(join(outputRoot, ".nojekyll"), "", "utf8");
console.log(`Built static site in ${outputRoot}`);
