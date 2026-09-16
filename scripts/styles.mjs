import { readFile, writeFile } from "node:fs/promises";
// The root entry already contains each component stylesheet exactly once.
await writeFile("dist/styles.css", await readFile("dist/index.css", "utf8"));
