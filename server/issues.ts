import type { PluginAttachmentSearchPayload, RpcInput } from "@getpaseo/plugin";
import type { ConnectionStatus, saveApiKeyRpc } from "../shared/connection";
import type { searchIssuesRpc } from "../shared/issues";
import type { KeyStore } from "./key-store";
import { MISSING_API_KEY_MESSAGE, createLinearIssueSearch, type LinearIssueSearch } from "./linear";

type KeySource = "settings" | "environment";

interface IssueHandlerOptions {
  keyStore: KeyStore;
  env?: NodeJS.ProcessEnv;
  request?: typeof fetch;
}

async function describeConnection(client: LinearIssueSearch, source: KeySource): Promise<ConnectionStatus> {
  try {
    return { status: "connected", source, ...(await client.viewer()) };
  } catch (error) {
    return { status: "error", source, error: error instanceof Error ? error.message : String(error) };
  }
}

export function createIssueHandlers({ keyStore, env = process.env, request }: IssueHandlerOptions) {
  async function linear(): Promise<{ client: LinearIssueSearch; source: KeySource } | null> {
    const saved = await keyStore.read();
    const fromEnv = env.LINEAR_API_KEY?.trim() ?? "";
    const apiKey = saved || fromEnv;
    if (!apiKey) return null;
    return { client: createLinearIssueSearch({ apiKey, request }), source: saved ? "settings" : "environment" };
  }

  async function connectionStatus(): Promise<ConnectionStatus> {
    const connection = await linear();
    return connection ? describeConnection(connection.client, connection.source) : { status: "missing" };
  }

  return {
    async searchIssues({ query }: RpcInput<typeof searchIssuesRpc>): Promise<PluginAttachmentSearchPayload> {
      const connection = await linear();
      if (!connection) throw new Error(MISSING_API_KEY_MESSAGE);
      return connection.client.search(query);
    },

    connectionStatus,

    async saveApiKey({ apiKey }: RpcInput<typeof saveApiKeyRpc>): Promise<ConnectionStatus> {
      const trimmed = apiKey.trim();
      if (!trimmed) return connectionStatus();
      const status = await describeConnection(createLinearIssueSearch({ apiKey: trimmed, request }), "settings");
      if (status.status === "connected") await keyStore.write(trimmed);
      return status;
    },

    async removeApiKey(): Promise<ConnectionStatus> {
      await keyStore.remove();
      return connectionStatus();
    },
  };
}
