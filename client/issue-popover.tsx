import type { PluginAttachmentItem } from "@getpaseo/plugin";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { useAgent, usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, type TextInput as NativeTextInput } from "react-native";
import { issueAttachments, searchIssuesRpc } from "../shared/issues";
import { readCachedIssues, sameIssues, writeCachedIssues } from "./search-cache";
import { useStrayPopoverGuard } from "./stray-popover";

type Issue = PluginAttachmentItem;

const SEARCH_DELAY_MS = 250;
// Paseo's MenuRoot dismisses the keyboard when it opens, last at 150ms, which blurs any input.
const FOCUS_DELAY_MS = 200;
const POPOVER_WIDTH = 380;
// A fixed height lets the host place the popover correctly on its first measure, before results load.
const POPOVER_HEIGHT = 360;

// Values from the app's Combobox (the built-in "Attach Linear issue" picker), so both pickers match.
const SPACING = { 1: 4, 2: 8, 3: 12 } as const;
const FONT_SIZE = { sm: 12, base: 14 } as const;
const RADIUS_MD = 6;
const RADIUS_LG = 8;
// PluginPopoverContent pads plugin popovers by spacing[3]; the Combobox layout runs edge to edge.
const HOST_PADDING = SPACING[3];
const ITEM_MIN_HEIGHT = 36;
const ICON_SIZE = 16;

// Same shape the app builds for the built-in picker, so the sent message shows the issue
// as a regular attachment.
function toAgentAttachment(issue: Issue) {
  return {
    type: "text" as const,
    mimeType: "text/plain" as const,
    title: `${issue.identifier} ${issue.title}`,
    text: issue.text,
    externalResource: {
      provider: "linear",
      providerLabel: issueAttachments.title,
      resourceType: issue.resourceType,
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
    },
  };
}

export function IssuePopover(props: PluginButtonContentProps) {
  const { theme, close, layout } = props;
  const agentId = props.context === "agent" ? props.agentId : null;
  const paseo = usePaseo();
  const search = useRpc(searchIssuesRpc);
  const toast = useToast();
  const status = useAgent(agentId ?? "", (agent) => agent.status);

  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState<Issue[]>(() => readCachedIssues("") ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const rootRef = useRef<View>(null);
  const inputRef = useRef<NativeTextInput>(null);
  const anchored = useStrayPopoverGuard(rootRef, layout.platform === "web" && !layout.compact);

  useEffect(() => {
    if (!anchored) return undefined;
    const timer = setTimeout(() => {
      const input = inputRef.current;
      input?.focus();
      // On web the ref is the DOM input; focus() alone leaves the caret before kept text.
      const element = input as unknown as { value?: string; setSelectionRange?: (start: number, end: number) => void };
      const end = element?.value?.length ?? 0;
      element?.setSelectionRange?.(end, end);
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [anchored, selected]);

  useEffect(() => {
    let current = true;
    const cached = readCachedIssues(query);
    if (cached) {
      setIssues(cached);
      setActiveIndex(0);
      setError(null);
    }
    setLoading(true);
    const timer = setTimeout(
      () => {
        search({ query })
          .then((result) => {
            writeCachedIssues(query, result.items);
            if (!current) return;
            setIssues((shown) => (sameIssues(shown, result.items) ? shown : result.items));
            setError(null);
          })
          .catch((err: unknown) => {
            if (!current) return;
            if (!cached) setIssues([]);
            setError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => {
            if (current) setLoading(false);
          });
      },
      cached ? 0 : SEARCH_DELAY_MS,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, search]);

  const busy = status === "running" || status === "initializing";

  async function send() {
    if (!agentId || !selected || sending) return;
    setSending(true);
    try {
      await paseo.agents.ref(agentId).send(note.trim() || `${selected.identifier}: ${selected.title}`, {
        attachments: [toAgentAttachment(selected)],
        ...(busy ? { activeTurnBehavior: "steer" as const } : {}),
      });
      toast.show(`Sent ${selected.identifier}`, { variant: "success" });
      close();
    } catch (err) {
      toast.error(`Could not send ${selected.identifier}: ${err instanceof Error ? err.message : String(err)}`);
      setSending(false);
    }
  }

  const styles = useMemo(
    () => ({
      root: {
        // Compact layouts show popovers as a full-width bottom sheet.
        width: layout.compact ? ("100%" as const) : POPOVER_WIDTH,
        height: POPOVER_HEIGHT,
        margin: -HOST_PADDING,
        borderRadius: RADIUS_LG,
        overflow: "hidden" as const,
        backgroundColor: theme.colors.surface0,
      },
      searchRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        paddingHorizontal: SPACING[3],
        gap: SPACING[2],
        backgroundColor: theme.colors.surface1,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      },
      searchInput: {
        flex: 1,
        outlineWidth: 0,
        paddingVertical: SPACING[3],
        color: theme.colors.foreground,
        fontSize: FONT_SIZE.base,
      },
      scroll: { flex: 1, minHeight: 0 },
      scrollContent: { paddingVertical: SPACING[1] },
      item: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        minHeight: ITEM_MIN_HEIGHT,
        gap: SPACING[2],
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
      },
      itemHighlighted: { backgroundColor: theme.colors.surface1 },
      itemContent: {
        flex: 1,
        flexShrink: 1,
        flexDirection: "row" as const,
        alignItems: "baseline" as const,
        gap: SPACING[2],
        overflow: "hidden" as const,
      },
      // Long titles truncate first so the status never shrinks to a stray letter.
      itemLabel: { fontSize: FONT_SIZE.base, color: theme.colors.foreground, flexShrink: 1, minWidth: 0 },
      itemDescription: {
        fontSize: FONT_SIZE.sm,
        color: theme.colors.foregroundMuted,
        flexShrink: 0,
        maxWidth: "40%" as const,
      },
      emptyText: {
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
        color: theme.colors.foregroundMuted,
        fontSize: FONT_SIZE.base,
      },
      errorText: {
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
        color: theme.colors.statusDanger,
        fontSize: FONT_SIZE.base,
      },
      preview: {
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
        color: theme.colors.foregroundMuted,
        fontSize: FONT_SIZE.sm,
        lineHeight: 18,
      },
      footer: {
        flexDirection: "row" as const,
        justifyContent: "flex-end" as const,
        alignItems: "center" as const,
        gap: SPACING[2],
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2],
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      },
      button: { paddingHorizontal: SPACING[3], paddingVertical: SPACING[1] + 2, borderRadius: RADIUS_MD },
      primaryButton: { backgroundColor: theme.colors.foreground },
      buttonText: { fontSize: FONT_SIZE.base, color: theme.colors.foreground },
      primaryButtonText: { fontSize: FONT_SIZE.base, color: theme.colors.surface0 },
    }),
    [theme, layout.compact],
  );

  if (!agentId) {
    return (
      <View style={{ width: POPOVER_WIDTH, maxWidth: "100%" }}>
        <Text style={styles.emptyText}>Open an agent to send it a Linear issue.</Text>
      </View>
    );
  }

  if (selected) {
    return (
      <View ref={rootRef} style={styles.root}>
        <View style={styles.searchRow}>
          <Icon name="MessageSquare" size={ICON_SIZE} color={theme.colors.foregroundMuted} />
          <TextInput
            ref={inputRef}
            value={note}
            onChangeText={setNote}
            onSubmitEditing={send}
            placeholder="Add a message (optional)"
            placeholderTextColor={theme.colors.foregroundMuted}
            accessibilityLabel="Message to send with the issue"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.scrollContent}>
          <View style={[styles.item, styles.itemHighlighted]}>
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel} numberOfLines={1}>
                {`${selected.identifier} ${selected.title}`}
              </Text>
              {selected.subtitle ? (
                <Text style={styles.itemDescription} numberOfLines={1}>
                  {selected.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {busy ? <Text style={styles.emptyText}>The agent is working. This adds the issue to the current turn.</Text> : null}
        </View>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.preview} selectable>
            {selected.text}
          </Text>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to search"
            onPress={() => setSelected(null)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Send ${selected.identifier} to the agent`}
            disabled={sending}
            onPress={send}
            style={[styles.button, styles.primaryButton, sending ? { opacity: 0.55 } : null]}
          >
            <Text style={styles.primaryButtonText}>{busy ? "Send and steer" : "Send"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const emptyText = loading ? "Searching..." : "No results found.";

  return (
    <View ref={rootRef} style={styles.root}>
      <View style={styles.searchRow}>
        <Icon name="Search" size={ICON_SIZE} color={theme.colors.foregroundMuted} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => issues[activeIndex] && setSelected(issues[activeIndex])}
          placeholder={issueAttachments.searchPlaceholder}
          placeholderTextColor={theme.colors.foregroundMuted}
          accessibilityLabel="Search Linear issues"
          style={styles.searchInput}
        />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!error && issues.length === 0 ? <Text style={styles.emptyText}>{emptyText}</Text> : null}
        {issues.map((issue, index) => (
          <Pressable
            key={issue.id}
            accessibilityRole="button"
            accessibilityLabel={`${issue.identifier} ${issue.title}`}
            onPress={() => setSelected(issue)}
            onHoverIn={() => setActiveIndex(index)}
            style={[styles.item, index === activeIndex ? styles.itemHighlighted : null]}
          >
            <View style={styles.itemContent}>
              <Text style={styles.itemLabel} numberOfLines={1}>
                {`${issue.identifier} ${issue.title}`}
              </Text>
              {issue.subtitle ? (
                <Text style={styles.itemDescription} numberOfLines={1}>
                  {issue.subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
