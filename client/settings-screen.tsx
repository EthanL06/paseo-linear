import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  ExternalLink,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text } from "react-native";
import { checkApiKeyRpc, connectionSettings, connectionStatusRpc, type ConnectionStatus } from "../shared/settings";
import { clearCachedIssues } from "./search-cache";

const API_KEYS_URL = "https://linear.app/settings/account/security";

const CHECK_DELAY_MS = 500;

type ReadySettings = Extract<SettingsState<typeof connectionSettings.schema>, { status: "ready" }>;

function describeKey(status: ConnectionStatus | null): { hint?: string; error?: string } {
  if (!status) return { hint: "Checking..." };
  if (status.status === "missing") return { hint: "Paste a personal API key. It is stored on this Paseo host." };
  if (status.status === "error") return { error: status.error };
  const source = status.source === "environment" ? " Using LINEAR_API_KEY from the host environment." : "";
  return { hint: `Connected as ${status.name} (${status.email}).${source}` };
}

function ConnectionForm({ settings }: { settings: ReadySettings }) {
  const activeStatus = useRpc(connectionStatusRpc);
  const checkApiKey = useRpc(checkApiKeyRpc);
  const saved = settings.values.apiKey;
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  // The settings object changes identity on every render; reading it through a ref keeps the
  // check effect from restarting while a check is in flight.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let current = true;
    const apiKey = draft.trim();
    const saveKey = (value: string) => settingsRef.current.save({ apiKey: value }, settingsRef.current.revision);
    setStatus(null);
    const timer = setTimeout(
      async () => {
        try {
          if (apiKey !== saved && !apiKey) {
            if (await saveKey("")) clearCachedIssues();
            return;
          }
          const result = apiKey === saved ? await activeStatus({}) : await checkApiKey({ apiKey });
          if (!current) return;
          setStatus(result);
          if (apiKey !== saved && result.status === "connected" && (await saveKey(apiKey))) {
            clearCachedIssues();
          }
        } catch (error) {
          if (current) {
            setStatus({ status: "error", source: "settings", error: error instanceof Error ? error.message : String(error) });
          }
        }
      },
      apiKey === saved ? 0 : CHECK_DELAY_MS,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [draft, saved, activeStatus, checkApiKey]);

  const described = describeKey(status);

  return (
    <SettingsSection title="Linear API key">
      <SettingsCard>
        <SettingsInput
          label="Personal API key"
          hint={described.hint}
          error={settings.saveError ?? described.error}
          initialValue={saved}
          onChangeText={setDraft}
          placeholder="lin_api_..."
          secureTextEntry
        />
        <SettingsRow label="Create a key" hint="In Linear, open Settings > Security & access > Personal API keys.">
          <ExternalLink href={API_KEYS_URL}>Linear security settings</ExternalLink>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}

export function ConnectionSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(connectionSettings);
  const textStyle = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") return <Text style={textStyle}>Loading settings...</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="Linear API key">
        <Text style={textStyle}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction label="Restore default settings" actionLabel="Reset" onPress={settings.reset} />
        ) : null}
      </SettingsSection>
    );
  }
  return <ConnectionForm settings={settings} />;
}
