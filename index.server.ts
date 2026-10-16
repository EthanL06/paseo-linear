import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createIssueHandlers } from "./server/issues";
import { searchIssuesRpc } from "./shared/issues";
import { checkApiKeyRpc, connectionSettings, connectionStatusRpc } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(connectionSettings);
  const handlers = createIssueHandlers({ settings });
  server.handle(searchIssuesRpc, handlers.searchIssues);
  server.handle(connectionStatusRpc, handlers.connectionStatus);
  server.handle(checkApiKeyRpc, handlers.checkApiKey);
  return () => {};
}
