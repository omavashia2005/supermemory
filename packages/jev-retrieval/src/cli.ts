declare const process: { argv:string[] };
import { evaluate } from "./evaluate";import type { ExperimentMode } from "./types";
const mode=(process.argv[2]??"baseline") as ExperimentMode,path=process.argv[3]??new URL("../fixtures/dataset.json",import.meta.url).pathname;
console.log(JSON.stringify(await evaluate(path,mode),null,2));
