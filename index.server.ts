import type { PluginServerContext } from "@getpaseo/plugin/server";
import { connectionStatusRpc, removeApiKeyRpc, saveApiKeyRpc } from "./shared/connection";
import { searchIssuesRpc } from "./shared/issues";
import { createIssueHandlers } from "./server/issues";
import { createFileKeyStore } from "./server/key-store";

export default function contribute(server: PluginServerContext) {
  const handlers = createIssueHandlers({ keyStore: createFileKeyStore() });
  server.handle(searchIssuesRpc, handlers.searchIssues);
  server.handle(connectionStatusRpc, handlers.connectionStatus);
  server.handle(saveApiKeyRpc, handlers.saveApiKey);
  server.handle(removeApiKeyRpc, handlers.removeApiKey);
  return () => {};
}
