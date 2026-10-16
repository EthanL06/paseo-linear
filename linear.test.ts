import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { createIssueHandlers } from "./server/issues";
import { createLinearIssueSearch } from "./server/linear";

function makeIssue(identifier: string, title: string, assignee: string | null = "Mohamed") {
  return {
    id: `${identifier.toLowerCase()}-uuid`,
    identifier,
    title,
    description: "Let extensions attach external context.",
    url: `https://linear.app/acme/issue/${identifier}`,
    priorityLabel: "High",
    state: { name: "In Progress" },
    assignee: assignee ? { name: assignee } : null,
    project: { name: "Paseo" },
    labels: { nodes: [{ name: "Feature" }] },
  };
}

const issue = makeIssue("ENG-123", "Plugin attachments");

interface CapturedRequest {
  authorization: string | undefined;
  body: { query: string; variables: Record<string, unknown> };
}

async function readRequest(request: IncomingMessage): Promise<CapturedRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return {
    authorization: request.headers.authorization,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as CapturedRequest["body"],
  };
}

async function withLinearServer<T>(
  respond: (request: CapturedRequest, response: ServerResponse) => void,
  run: (endpoint: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request, response) => {
    void readRequest(request).then((captured) => respond(captured, response));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}/graphql`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function isMine(variables: Record<string, unknown>): boolean {
  const filter = variables.filter as { assignee?: unknown } | null;
  return Boolean(filter?.assignee);
}

describe("Linear issue search", () => {
  it("resolves an exact issue identifier and formats its agent snapshot", async () => {
    const result = await withLinearServer(
      (request, response) => {
        assert.equal(request.authorization, "lin_api_test");
        assert.deepEqual(request.body.variables, { id: "ENG-123" });
        sendJson(response, { data: { issue } });
      },
      (endpoint) => createLinearIssueSearch({ apiKey: "lin_api_test", endpoint }).search("eng-123"),
    );

    assert.deepEqual(result, {
      items: [
        {
          id: "eng-123-uuid",
          identifier: "ENG-123",
          title: "Plugin attachments",
          subtitle: "In Progress · Mohamed",
          url: issue.url,
          resourceType: "issue",
          text: [
            "Linear issue ENG-123: Plugin attachments",
            `URL: ${issue.url}`,
            "Status: In Progress",
            "Priority: High",
            "Assignee: Mohamed",
            "Project: Paseo",
            "Labels: Feature",
            "",
            "Let extensions attach external context.",
          ].join("\n"),
        },
      ],
    });
  });

  it("searches titles case-insensitively and lists my issues first without duplicates", async () => {
    const mine = makeIssue("ENG-2", "Plugin settings");
    const other = makeIssue("ENG-1", "Plugin attachments", "Someone else");
    const filters: unknown[] = [];
    const result = await withLinearServer(
      (request, response) => {
        filters.push(request.body.variables.filter);
        const nodes = isMine(request.body.variables) ? [mine] : [other, mine];
        sendJson(response, { data: { issues: { nodes } } });
      },
      (endpoint) => createLinearIssueSearch({ apiKey: "lin_api_test", endpoint }).search(" plugin "),
    );

    assert.deepEqual(
      result.items.map((item) => item.identifier),
      ["ENG-2", "ENG-1"],
    );
    const title = { containsIgnoreCase: "plugin" };
    assert.deepEqual(
      new Set(filters.map((filter) => JSON.stringify(filter))),
      new Set([JSON.stringify({ title, assignee: { isMe: { eq: true } } }), JSON.stringify({ title })]),
    );
  });

  it("lists recent issues without a title filter for an empty query", async () => {
    const filters: unknown[] = [];
    await withLinearServer(
      (request, response) => {
        filters.push(request.body.variables.filter);
        sendJson(response, { data: { issues: { nodes: [] } } });
      },
      (endpoint) => createLinearIssueSearch({ apiKey: "lin_api_test", endpoint }).search(""),
    );

    assert.deepEqual(
      new Set(filters.map((filter) => JSON.stringify(filter))),
      new Set([JSON.stringify({ assignee: { isMe: { eq: true } } }), "null"]),
    );
  });

  it("surfaces GraphQL errors even when HTTP succeeds", async () => {
    await assert.rejects(
      withLinearServer(
        (_request, response) => sendJson(response, { errors: [{ message: "Token expired" }] }),
        (endpoint) => createLinearIssueSearch({ apiKey: "lin_api_test", endpoint }).search("ENG-123"),
      ),
      /Token expired/,
    );
  });

  it("explains a rejected API key", async () => {
    await assert.rejects(
      withLinearServer(
        (_request, response) => {
          response.writeHead(401);
          response.end();
        },
        (endpoint) => createLinearIssueSearch({ apiKey: "lin_api_test", endpoint }).search("ENG-123"),
      ),
      /Linear rejected the API key/,
    );
  });

  it("requires an API key", () => {
    assert.throws(() => createLinearIssueSearch({ apiKey: "" }), /Add a Linear API key/);
  });
});

describe("API key resolution", () => {
  function fakeSettings(apiKey: string) {
    return {
      read: async () => ({ status: "ready" as const, revision: "1", values: { apiKey } }),
      subscribe: () => () => {},
    };
  }

  function recordKeys(keys: string[]) {
    return (async (_url: string, init?: { headers?: Record<string, string> }) => {
      keys.push(init?.headers?.Authorization ?? "");
      return new Response(JSON.stringify({ data: { viewer: { name: "Alex", email: "alex@example.com" } } }));
    }) as unknown as typeof fetch;
  }

  it("prefers the saved key over LINEAR_API_KEY", async () => {
    const keys: string[] = [];
    const handlers = createIssueHandlers({
      settings: fakeSettings("lin_api_saved"),
      env: { LINEAR_API_KEY: "lin_api_env" },
      request: recordKeys(keys),
    });
    assert.deepEqual(await handlers.connectionStatus(), {
      status: "connected",
      source: "settings",
      name: "Alex",
      email: "alex@example.com",
    });
    assert.deepEqual(keys, ["lin_api_saved"]);
  });

  it("falls back to LINEAR_API_KEY", async () => {
    const keys: string[] = [];
    const handlers = createIssueHandlers({
      settings: fakeSettings(""),
      env: { LINEAR_API_KEY: " lin_api_env " },
      request: recordKeys(keys),
    });
    const status = await handlers.connectionStatus();
    assert.equal(status.status === "connected" && status.source, "environment");
    assert.deepEqual(keys, ["lin_api_env"]);
  });

  it("explains how to add a key when none is set", async () => {
    const handlers = createIssueHandlers({ settings: fakeSettings(""), env: {} });
    assert.deepEqual(await handlers.connectionStatus(), { status: "missing" });
    await assert.rejects(handlers.searchIssues({ query: "" }), /Settings, Plugins, Linear/);
  });

  it("checks a typed key without saving it", async () => {
    const keys: string[] = [];
    const handlers = createIssueHandlers({ settings: fakeSettings(""), env: {}, request: recordKeys(keys) });
    const status = await handlers.checkApiKey({ apiKey: " lin_api_typed " });
    assert.equal(status.status, "connected");
    assert.deepEqual(keys, ["lin_api_typed"]);
    assert.deepEqual(await handlers.checkApiKey({ apiKey: "  " }), { status: "missing" });
  });
});
