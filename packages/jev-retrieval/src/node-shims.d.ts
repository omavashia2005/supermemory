declare module "node:fs/promises" {
  export function mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
}
