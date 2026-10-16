import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const connectionSettings = defineSettings({
  id: "connection",
  scope: "host",
  version: 1,
  schema: z.object({
    apiKey: z.string().trim().default(""),
  }),
});

export const ConnectionStatusSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("connected"),
    source: z.enum(["settings", "environment"]),
    name: z.string(),
    email: z.string(),
  }),
  z.object({ status: z.literal("missing") }),
  z.object({ status: z.literal("error"), source: z.enum(["settings", "environment"]), error: z.string() }),
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const connectionStatusRpc = defineRpc({
  name: "connection.status",
  input: z.object({}),
  output: ConnectionStatusSchema,
});

export const checkApiKeyRpc = defineRpc({
  name: "connection.check",
  input: z.object({ apiKey: z.string() }),
  output: ConnectionStatusSchema,
});
