// 各 agent 的 MCP 手动配置示例：Agent 接入页（带真实 token）与官网文档页（token 占位）共用一份，避免两处写法不一致

export function mcpSnippets(url: string, token: string, genericLabel: string): [string, string][] {
  return [
    ["Claude Code", `claude mcp add --transport http deepfy ${url} \\\n  --header "Authorization: Bearer ${token}"`],
    ["Codex (~/.codex/config.toml)", `[mcp_servers.deepfy]\nurl = "${url}"\nbearer_token_env_var = "DEEPFY_TOKEN"\n\n# shell: export DEEPFY_TOKEN="${token}"`],
    [genericLabel, JSON.stringify({ mcpServers: { deepfy: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)],
  ];
}
