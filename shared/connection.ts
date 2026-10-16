import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const KeySourceSchema = z.enum(["settings", "environment"]);

export const ConnectionStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("connected"), source: KeySourceSchema, name: z.string(), email: z.string() }),
  z.object({ status: z.literal("missing") }),
  z.object({ status: z.literal("error"), source: KeySourceSchema, error: z.string() }),
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const connectionStatusRpc = defineRpc({
  name: "connection.status",
  input: z.object({}),
  output: ConnectionStatusSchema,
});

export const saveApiKeyRpc = defineRpc({
  name: "connection.save",
  input: z.object({ apiKey: z.string() }),
  output: ConnectionStatusSchema,
});

export const removeApiKeyRpc = defineRpc({
  name: "connection.remove",
  input: z.object({}),
  output: ConnectionStatusSchema,
});
