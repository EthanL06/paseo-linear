import type { PluginAttachmentSearchPayload, RpcInput } from "@getpaseo/plugin";
import type { PluginSettings } from "@getpaseo/plugin/server";
import type { searchIssuesRpc } from "../shared/issues";
import type { ConnectionStatus, checkApiKeyRpc, connectionSettings } from "../shared/settings";
import { MISSING_API_KEY_MESSAGE, createLinearIssueSearch, type LinearIssueSearch } from "./linear";

type ConnectionSettings = PluginSettings<typeof connectionSettings.schema>;
type KeySource = "settings" | "environment";

interface IssueHandlerOptions {
  settings: ConnectionSettings;
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

export function createIssueHandlers({ settings, env = process.env, request }: IssueHandlerOptions) {
  async function resolveApiKey(): Promise<{ apiKey: string; source: KeySource } | null> {
    const state = await settings.read();
    const saved = state.status === "ready" ? state.values.apiKey : "";
    if (saved) return { apiKey: saved, source: "settings" };
    const fromEnv = env.LINEAR_API_KEY?.trim() ?? "";
    return fromEnv ? { apiKey: fromEnv, source: "environment" } : null;
  }

  async function linear(): Promise<{ client: LinearIssueSearch; source: KeySource } | null> {
    const key = await resolveApiKey();
    if (!key) return null;
    return { client: createLinearIssueSearch({ apiKey: key.apiKey, request }), source: key.source };
  }

  return {
    async searchIssues({ query }: RpcInput<typeof searchIssuesRpc>): Promise<PluginAttachmentSearchPayload> {
      const connection = await linear();
      if (!connection) throw new Error(MISSING_API_KEY_MESSAGE);
      return connection.client.search(query);
    },

    async connectionStatus(): Promise<ConnectionStatus> {
      const connection = await linear();
      return connection ? describeConnection(connection.client, connection.source) : { status: "missing" };
    },

    async checkApiKey({ apiKey }: RpcInput<typeof checkApiKeyRpc>): Promise<ConnectionStatus> {
      const trimmed = apiKey.trim();
      if (!trimmed) return { status: "missing" };
      return describeConnection(createLinearIssueSearch({ apiKey: trimmed, request }), "settings");
    },
  };
}
