import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getDb } from "@/db/client";
import { createMcpServer } from "@/mcp/server";
import { masterKey } from "@/server/crypto";
import { clientIp, createLimiter } from "@/server/login-lookup";
import { PgRepository } from "@/server/pg-repository";
import { tokenAuth } from "@/server/tokens";

// Deepfy MCP 端点（Streamable HTTP，无状态）：Authorization: Bearer kzh_…；每个账号每分钟最多 60 次；token 可写入时开放写入工具

export const dynamic = "force-dynamic";
const perUser = createLimiter(60, 60_000);
const perIp = createLimiter(120, 60_000);
const MAX_BODY = 5 * 1024 * 1024;

const rpcError = (code: number, message: string, status: number) => Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status });

const unauthorized = () =>
  Response.json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: create a token at app.deepfy.si/agents (Deepfy → Agents)" }, id: null },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="deepfy"', "cache-control": "no-store" } });

async function handle(req: Request) {
  const ip = clientIp(req);
  if (!perIp(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });
  const db = getDb();
  const auth = await tokenAuth(db, req.headers.get("authorization"));
  if (!auth) return unauthorized();
  const { userId } = auth;
  if (!perUser(userId)) return rpcError(-32002, "Rate limited, retry in a minute", 429);
  if (req.method === "POST") {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return rpcError(-32600, "Request too large", 413);
    // 一个批量请求可以带很多调用，会绕过上面的按次限速。当前 MCP 协议已经不用批量
    if (Array.isArray(await req.clone().json().catch(() => undefined))) return rpcError(-32600, "Batch requests are not supported", 400);
  }

  const repo = new PgRepository(db, userId, masterKey());
  const write = auth.scope === "write"
    ? { writer: repo, audit: { tokenId: auth.tokenId, tokenName: auth.name }, appUrl: process.env.KZ_APP_URL || new URL(req.url).origin }
    : undefined;
  const server = createMcpServer(repo, undefined, write);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
