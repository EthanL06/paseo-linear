import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface KeyStore {
  read(): Promise<string>;
  write(apiKey: string): Promise<void>;
  remove(): Promise<void>;
}

export function defaultKeyPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "plugin-data", "linear", "api-key");
}

// The key lives in a file only the daemon user can read, so connected apps can never read it back.
export function createFileKeyStore(path: string = defaultKeyPath()): KeyStore {
  return {
    async read() {
      try {
        return (await readFile(path, "utf8")).trim();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
        throw error;
      }
    },
    async write(apiKey) {
      const dir = dirname(path);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await chmod(dir, 0o700);
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, apiKey, { mode: 0o600 });
      await rename(temporary, path);
    },
    async remove() {
      await rm(path, { force: true });
    },
  };
}
