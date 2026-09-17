declare const process: { argv: string[] };
import { evaluate } from "./evaluate";
import { loadJudge } from "./longmemeval";
import type { ExperimentMode } from "./types";

const args = process.argv.slice(2);
const modeNames: ExperimentMode[] = ["baseline", "reranker-only", "graph-traversal-only", "reranker-and-traversal"];
const modes = (args[0] ?? "baseline").split(",") as ExperimentMode[];
if (modes.some((mode) => !modeNames.includes(mode))) throw new Error(`Unknown mode: ${modes.find((mode) => !modeNames.includes(mode))}`);
const datasetPath = args[1] ?? new URL("../fixtures/dataset.json", import.meta.url).pathname;
const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const judgePath = option("--judge-module");
const judge = judgePath ? await loadJudge(judgePath) : undefined;
const k = option("--k");
const topK = k ? Number(k) : 10;
if (!Number.isInteger(topK) || topK < 1) throw new Error("--k must be a positive integer");

const reports = [];
for (const mode of modes) reports.push(await evaluate(datasetPath, mode, judge, topK));
console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
