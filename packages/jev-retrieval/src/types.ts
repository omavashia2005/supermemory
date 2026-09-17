export type ExperimentMode = "baseline" | "reranker-only" | "graph-traversal-only" | "reranker-and-traversal";
export interface Memory { id:string; tenantId:string; text:string; source:{documentId:string;chunkId:string}; createdAt:string; expiresAt?:string; supersededBy?:string; initialScore:number }
export interface Edge { from:string; to:string; relation:string }
export interface CandidateProvider { candidates(query:string,tenantId:string,limit:number,signal?:AbortSignal):Promise<Memory[]> }
export interface GraphProvider { neighbors(id:string,tenantId:string,signal?:AbortSignal):Promise<Edge[]>; get(ids:string[],tenantId:string,signal?:AbortSignal):Promise<Memory[]> }
export interface Judgment { id:string; score:number; expand?:boolean; rationale?:string }
export interface Usage { inputTokens?:number; outputTokens?:number; estimatedCostUsd?:number; model?:string }
export interface JudgeResult { judgments:Judgment[]; usage?:Usage }
export interface JevJudge { judge(input:{purpose:"rank"|"expand";query:string; candidates:Memory[];criteria:string;signal:AbortSignal}):Promise<JudgeResult> }
export interface Limits { initialCandidates:number; maxCandidates:number; topK:number; maxHops:number; maxGraphReads:number; maxTypeSafeRequests:number; maxInputTokens:number; contextTokens:number; timeoutMs:number; retries:number }
export interface Trace { graphReads:number; candidateCount:number; typeSafeRequests:number; usage:Usage; fallback:boolean; fallbackReasons:string[]; latencyMs:number }
export interface RetrievalResult { ranked:Memory[]; memories:Memory[]; context:string; trace:Trace }
