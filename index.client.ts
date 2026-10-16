import type { PluginClientContext } from "@getpaseo/plugin/client";
import { addLinearPills } from "./client/pills";
import { writeCachedIssues } from "./client/search-cache";
import { ConnectionSettingsScreen } from "./client/settings-screen";
import { issueAttachments, searchIssuesRpc } from "./shared/issues";

export default function contribute(client: PluginClientContext) {
  const removeSettingsScreen = client.addSettingsScreen({
    id: "connection",
    title: "Connection",
    icon: "KeyRound",
    Component: ConnectionSettingsScreen,
  });
  const removeAttachmentSource = client.addAttachmentSource(issueAttachments);
  const removePills = addLinearPills(client);
  void client
    .rpc(searchIssuesRpc, { query: "" })
    .then((result) => writeCachedIssues("", result.items))
    .catch(() => undefined);
  return async () => {
    removePills();
    removeSettingsScreen();
    await removeAttachmentSource();
  };
}
