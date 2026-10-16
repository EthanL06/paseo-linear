import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { IssuePopover } from "./issue-popover";
import { LinearLogo } from "./linear-logo";
import { PILL_TITLE } from "./stray-popover";

export function addLinearPills(client: PluginClientContext): () => void {
  const pills = new Map<string, PluginButtonRegistration>();
  const lifetime = new AbortController();

  const register = (agent: { id: string; workspaceId?: string | null }) => {
    if (lifetime.signal.aborted || !agent.workspaceId) return;
    pills.get(agent.id)?.remove();
    pills.set(
      agent.id,
      client.addComposerPill({
        id: "linear-issue",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: {
          title: PILL_TITLE,
          icon: LinearLogo,
          behavior: { kind: "popover", Content: IssuePopover },
        },
      }),
    );
  };

  const removeAll = () => {
    for (const pill of pills.values()) pill.remove();
    pills.clear();
  };

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          removeAll();
          for (const { agent } of entries) register(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") return register(update.agent);
          pills.get(update.agentId)?.remove();
          pills.delete(update.agentId);
        },
      });
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.error("Linear: agent observation failed", error);
    });

  return () => {
    lifetime.abort();
    removeAll();
  };
}
