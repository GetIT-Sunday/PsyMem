import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLAUDE_SETTINGS } from "../paths.js";
import { readJson, writeJson, pathExists } from "../utils/fs.js";
import { branded, brandedGuide } from "../format.js";

interface ClaudeSettings {
  theme?: string;
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpJson {
  mcpServers?: Record<string, McpServerConfig>;
}

export function registerMcpTools(server: McpServer) {
  // list_mcp_servers
  server.tool(
    "list_mcp_servers",
    "List all configured MCP servers (global + project-level .mcp.json). IMPORTANT: You MUST reproduce the full list in your response text so the user can see it without expanding the tool output.",
    {
      project_path: z.string().optional().describe("Check project-level .mcp.json in this directory"),
    },
    async ({ project_path }) => {
      try {
        let lines = "";

        // Global settings
        if (await pathExists(CLAUDE_SETTINGS)) {
          const settings = await readJson<ClaudeSettings>(CLAUDE_SETTINGS);
          const globalServers = settings.mcpServers || {};
          const entries = Object.entries(globalServers);

          lines += `[MCP] 全局配置 (${entries.length} 个)\n\n`;
          for (const [name, config] of entries) {
            const cmd = config.args && config.args.length > 0
              ? `${config.command} ${config.args.join(" ")}`
              : config.command;
            lines += `  - ${name}\n    命令: ${cmd}\n`;
            if (config.env && Object.keys(config.env).length > 0) {
              lines += `    环境变量: ${Object.keys(config.env).join(", ")}\n`;
            }
            lines += "\n";
          }
        } else {
          lines += `[MCP] 全局配置文件未找到\n\n`;
        }

        // Project-level .mcp.json
        if (project_path) {
          const mcpJsonPath = path.join(project_path, ".mcp.json");
          if (await pathExists(mcpJsonPath)) {
            const mcpJson = await readJson<McpJson>(mcpJsonPath);
            const projServers = mcpJson.mcpServers || {};
            const projEntries = Object.entries(projServers);

            lines += `[MCP] 项目级配置: ${project_path}/.mcp.json (${projEntries.length} 个)\n\n`;
            for (const [name, config] of projEntries) {
              const cmd = config.args && config.args.length > 0
                ? `${config.command} ${config.args.join(" ")}`
                : config.command;
              lines += `  - ${name}\n    命令: ${cmd}\n\n`;
            }
          } else {
            lines += `[MCP] 项目 ${project_path} 无 .mcp.json\n\n`;
          }
        }

        return brandedGuide(
          lines || "[MCP] 未找到任何 MCP Server 配置",
          "告诉我 '添加 MCP server [名称]，命令是 [command]' 来添加"
        );
      } catch (e) {
        return branded(`[MCP] 读取配置失败\n\n${(e as Error).message}`);
      }
    }
  );

  // add_mcp_server
  server.tool(
    "add_mcp_server",
    "Add a new MCP server to Claude Code settings",
    {
      name: z.string().describe("Name for the MCP server"),
      command: z.string().describe("Command to run the server (e.g. 'node', 'npx')"),
      args: z.array(z.string()).optional().describe("Arguments for the command"),
      env: z.record(z.string(), z.string()).optional().describe("Environment variables for the server"),
    },
    async ({ name, command, args, env }) => {
      try {
        let settings: ClaudeSettings = {};
        if (await pathExists(CLAUDE_SETTINGS)) {
          settings = await readJson<ClaudeSettings>(CLAUDE_SETTINGS);
        }

        if (!settings.mcpServers) {
          settings.mcpServers = {};
        }

        if (settings.mcpServers[name]) {
          return branded(
            `[MCP] 添加失败\n\n  "${name}" 已存在。\n  提示：用 '修改 MCP server ${name}' 来更新配置。`
          );
        }

        const config: McpServerConfig = { command };
        if (args && args.length > 0) config.args = args;
        if (env && Object.keys(env).length > 0) config.env = env as Record<string, string>;

        settings.mcpServers[name] = config;
        await writeJson(CLAUDE_SETTINGS, settings);

        const cmd = args && args.length > 0 ? `${command} ${args.join(" ")}` : command;
        return brandedGuide(
          `[MCP] 添加成功\n\n  名称: ${name}\n  命令: ${cmd}`,
          "重启 Claude Code 后生效。告诉我 '列出 MCP servers' 查看全部配置"
        );
      } catch (e) {
        return branded(`[MCP] 添加失败\n\n${(e as Error).message}`);
      }
    }
  );

  // remove_mcp_server
  server.tool(
    "remove_mcp_server",
    "Remove an MCP server from Claude Code settings",
    {
      name: z.string().describe("Name of the MCP server to remove"),
    },
    async ({ name }) => {
      try {
        if (!(await pathExists(CLAUDE_SETTINGS))) {
          return branded(`[MCP] 配置文件未找到`);
        }

        const settings = await readJson<ClaudeSettings>(CLAUDE_SETTINGS);

        if (!settings.mcpServers || !settings.mcpServers[name]) {
          return branded(
            `[MCP] 删除失败\n\n  "${name}" 不存在。\n  提示：告诉我 '列出 MCP servers' 查看所有配置`
          );
        }

        delete settings.mcpServers[name];
        await writeJson(CLAUDE_SETTINGS, settings);

        return brandedGuide(
          `[MCP] 删除成功\n\n  已移除: ${name}`,
          "告诉我 '列出 MCP servers' 确认删除结果"
        );
      } catch (e) {
        return branded(`[MCP] 删除失败\n\n${(e as Error).message}`);
      }
    }
  );

  // update_mcp_server
  server.tool(
    "update_mcp_server",
    "Update an existing MCP server's configuration",
    {
      name: z.string().describe("Name of the MCP server to update"),
      command: z.string().optional().describe("New command"),
      args: z.array(z.string()).optional().describe("New arguments"),
      env: z.record(z.string(), z.string()).optional().describe("New environment variables"),
    },
    async ({ name, command, args, env }) => {
      try {
        if (!(await pathExists(CLAUDE_SETTINGS))) {
          return branded(`[MCP] 配置文件未找到`);
        }

        const settings = await readJson<ClaudeSettings>(CLAUDE_SETTINGS);

        if (!settings.mcpServers || !settings.mcpServers[name]) {
          return branded(
            `[MCP] 更新失败\n\n  "${name}" 不存在。用 '添加 MCP server ${name}' 来创建。`
          );
        }

        const changes: string[] = [];
        if (command) {
          settings.mcpServers[name].command = command;
          changes.push(`命令: ${command}`);
        }
        if (args) {
          settings.mcpServers[name].args = args;
          changes.push(`参数: ${args.join(" ")}`);
        }
        if (env) {
          settings.mcpServers[name].env = env as Record<string, string>;
          changes.push(`环境变量: ${Object.keys(env).join(", ")}`);
        }

        await writeJson(CLAUDE_SETTINGS, settings);

        return brandedGuide(
          `[MCP] 更新成功\n\n  名称: ${name}\n  修改: ${changes.join(" | ")}`,
          "重启 Claude Code 后生效"
        );
      } catch (e) {
        return branded(`[MCP] 更新失败\n\n${(e as Error).message}`);
      }
    }
  );
}
