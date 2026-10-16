import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import type { SettingsInputHandle } from "@getpaseo/plugin/client/ui";
import {
  ExternalLink,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectionStatusRpc,
  removeApiKeyRpc,
  saveApiKeyRpc,
  type ConnectionStatus,
} from "../shared/connection";
import { clearCachedIssues } from "./search-cache";

const API_KEYS_URL = "https://linear.app/settings/account/security";
const CHECK_DELAY_MS = 500;

function describeKey(
  status: ConnectionStatus | null,
  checking: boolean,
  checkError: string | null,
): { hint?: string; error?: string } {
  if (checking || !status) return { hint: "Checking..." };
  if (checkError) return { error: checkError };
  if (status.status === "missing") return { hint: "Paste a personal API key. It is stored only on this Paseo host." };
  if (status.status === "error") return { error: status.error };
  const source =
    status.source === "environment" ? " Using LINEAR_API_KEY from the host environment." : " Using the saved key.";
  return { hint: `Connected as ${status.name} (${status.email}).${source}` };
}

function toErrorStatus(error: unknown): ConnectionStatus {
  return { status: "error", source: "settings", error: error instanceof Error ? error.message : String(error) };
}

export function ConnectionSettingsScreen(_props: PluginSurfaceProps) {
  const loadStatus = useRpc(connectionStatusRpc);
  const saveApiKey = useRpc(saveApiKeyRpc);
  const removeApiKey = useRpc(removeApiKeyRpc);
  const inputRef = useRef<SettingsInputHandle>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let current = true;
    loadStatus({})
      .catch(toErrorStatus)
      .then((result) => {
        if (current) setStatus(result);
      });
    return () => {
      current = false;
    };
  }, [loadStatus]);

  useEffect(() => {
    const apiKey = draft.trim();
    if (!apiKey) {
      setChecking(false);
      setCheckError(null);
      return undefined;
    }
    let current = true;
    setChecking(true);
    const timer = setTimeout(async () => {
      const result = await saveApiKey({ apiKey }).catch(toErrorStatus);
      if (!current) return;
      setChecking(false);
      if (result.status !== "connected") {
        setCheckError(result.status === "error" ? result.error : null);
        return;
      }
      setCheckError(null);
      setStatus(result);
      clearCachedIssues();
      // The host never sends the saved key back, so it should not stay on screen either.
      inputRef.current?.replaceText("");
      setDraft("");
    }, CHECK_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [draft, saveApiKey]);

  const remove = useCallback(async () => {
    setRemoving(true);
    const result = await removeApiKey({}).catch(toErrorStatus);
    clearCachedIssues();
    setStatus(result);
    setRemoving(false);
  }, [removeApiKey]);

  const described = describeKey(status, checking, checkError);
  const hasSavedKey = status !== null && status.status !== "missing" && status.source === "settings";

  return (
    <SettingsSection title="Linear API key">
      <SettingsCard>
        <SettingsInput
          ref={inputRef}
          label="Personal API key"
          hint={described.hint}
          error={described.error}
          onChangeText={setDraft}
          placeholder={hasSavedKey ? "Paste a new key to replace it" : "lin_api_..."}
          secureTextEntry
        />
        {hasSavedKey ? (
          <SettingsAction
            label="Saved key"
            hint="Stored on this Paseo host. Removing it falls back to LINEAR_API_KEY if set."
            actionLabel="Remove"
            disabled={removing}
            onPress={() => void remove()}
          />
        ) : null}
        <SettingsRow label="Create a key" hint="In Linear, open Settings > Security & access > Personal API keys.">
          <ExternalLink href={API_KEYS_URL}>Linear security settings</ExternalLink>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  );
}
