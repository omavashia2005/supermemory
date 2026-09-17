declare const process: { argv: string[]; cwd(): string };
import { loadJudge, runLongMemEval } from "./longmemeval";
import type { ExperimentMode } from "./types";

const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const datasetPath = value("--dataset");
if (!datasetPath) throw new Error("Usage: --dataset FILE [--output DIR] [--modes comma,list] [--judge-module FILE] [--limit N]");
const modes = (value("--modes") ?? "baseline,reranker-only,graph-traversal-only,reranker-and-traversal").split(",") as ExperimentMode[];
const topK = value("--k");
const judgePath = value("--judge-module");
const judge = judgePath ? await loadJudge(judgePath) : undefined;
await runLongMemEval({ datasetPath, outputDirectory: value("--output") ?? "longmemeval-results", modes, judge, limit: value("--limit") ? Number(value("--limit")) : undefined, topK: topK ? Number(topK) : undefined });
