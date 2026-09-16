import { performance } from "node:perf_hooks";
import { flattenSchema, setIn } from "../src/core/tree";
for (const count of [100, 1000, 10000]) {
  const root = {
    properties: Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `field${i}`,
        { type: "string" as const },
      ]),
    ),
  };
  const samples: number[] = [];
  for (let run = 0; run < 25; run++) {
    const start = performance.now();
    flattenSchema({ root, expanded: new Set(), maxRows: count });
    setIn(root, ["properties", `field${count - 1}`, "description"], "Updated");
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      nodes: count,
      medianMs: +samples[12].toFixed(2),
      p95Ms: +samples[23].toFixed(2),
    }),
  );
}
