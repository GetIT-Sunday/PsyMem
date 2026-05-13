import path from "path";
import fs from "fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLAUDE_SESSIONS, CLAUDE_PROJECTS, projectHashToPath } from "../paths.js";
import { pathExists, listDir, isDirectory, readJson } from "../utils/fs.js";
import { branded, brandedGuide } from "../format.js";

interface SessionMeta {
  id: string;
  project: string;
  startTime: string;
  size: string;
  preview: string;
  source: "session" | "project";
  filePath: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatTime(ts: number | string): string {
  const d = new Date(typeof ts === "number" ? ts : parseInt(ts));
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHr < 24) return `${diffHr} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;
  return d.toLocaleDateString("zh-CN");
}

async function getStats(filePath: string) {
  const stat = await fs.stat(filePath);
  return { size: stat.size, mtime: stat.mtimeMs };
}

async function getSessionPreviews(): Promise<SessionMeta[]> {
  const sessions: SessionMeta[] = [];

  if (!(await pathExists(CLAUDE_SESSIONS))) return sessions;

  const files = await listDir(CLAUDE_SESSIONS);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(CLAUDE_SESSIONS, file);
    if (await isDirectory(filePath)) continue;

    try {
      const stats = await getStats(filePath);
      const data = await readJson<any>(filePath);

      let preview = "";
      let project = "";
      let startTime = "";

      if (data.cwd) {
        // Type 1: numeric name, has cwd/startedAt
        project = data.cwd;
        startTime = formatTime(data.startedAt || stats.mtime);
        preview = data.status || "";
      } else if (data.messages && Array.isArray(data.messages)) {
        // Type 2: session-*.json, has messages
        startTime = formatTime(stats.mtime);
        // Find first user message for preview
        for (const msg of data.messages) {
          if (msg.role === "user" && msg.blocks) {
            for (const block of msg.blocks) {
              if (block.type === "text" && block.text) {
                preview = block.text.slice(0, 100);
                break;
              }
            }
            if (preview) break;
          }
        }
        // Find project from metadata if available
        const metaMsg = data.messages.find((m: any) => m.project);
        if (metaMsg) project = metaMsg.project;
      }

      sessions.push({
        id: file.replace(".json", ""),
        project: project || "(unknown)",
        startTime,
        size: formatSize(stats.size),
        preview: preview || "(无预览)",
        source: "session",
        filePath,
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Also scan project-level .jsonl sessions
  if (await pathExists(CLAUDE_PROJECTS)) {
    const projectDirs = await listDir(CLAUDE_PROJECTS);
    for (const dir of projectDirs) {
      const dirPath = path.join(CLAUDE_PROJECTS, dir);
      if (!(await isDirectory(dirPath))) continue;

      const projFiles = await listDir(dirPath);
      for (const file of projFiles) {
        if (!file.endsWith(".jsonl")) continue;
        const sessionId = file.replace(".jsonl", "");

        // Skip if already found in sessions dir
        if (sessions.some((s) => s.id === sessionId)) continue;

        const filePath = path.join(dirPath, file);
        try {
          const stats = await getStats(filePath);

          // Read first user message for preview
          let preview = "";
          const content = await fs.readFile(filePath, "utf-8");
          const lines = content.split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj.type === "user" && obj.message) {
                if (typeof obj.message === "string") {
                  preview = obj.message.slice(0, 100);
                } else if (obj.message.content) {
                  const c = obj.message.content;
                  if (typeof c === "string") preview = c.slice(0, 100);
                  else if (Array.isArray(c) && c[0]?.text) preview = c[0].text.slice(0, 100);
                }
                break;
              }
            } catch {}
          }

          sessions.push({
            id: sessionId,
            project: projectHashToPath(dir),
            startTime: formatTime(stats.mtime),
            size: formatSize(stats.size),
            preview: preview || "(无预览)",
            source: "project",
            filePath,
          });
        } catch {
          // Skip
        }
      }
    }
  }

  // Sort by most recent first
  return sessions;
}

export function registerSessionTools(server: McpServer) {
  // list_sessions
  server.tool(
    "list_sessions",
    "List all Claude Code conversation sessions with metadata",
    {
      project_path: z.string().optional().describe("Filter sessions by project path"),
      limit: z.number().optional().describe("Max sessions to show (default: 20)"),
    },
    async ({ project_path, limit }) => {
      try {
        let sessions = await getSessionPreviews();

        if (project_path) {
          sessions = sessions.filter((s) =>
            s.project.includes(project_path) || s.project === project_path
          );
        }

        const max = limit || 20;
        sessions = sessions.slice(0, max);

        if (sessions.length === 0) {
          return branded(
            `[Sessions] 没有找到对话\n\n${project_path ? `项目 ${project_path} 下无对话记录` : "暂无对话记录"}`
          );
        }

        let lines = `[Sessions] 共 ${sessions.length} 个对话\n\n`;
        for (let i = 0; i < sessions.length; i++) {
          const s = sessions[i];
          lines += `  ${i + 1}. [${s.startTime}] ${s.size}\n`;
          lines += `     项目: ${s.project}\n`;
          lines += `     ${s.preview}\n`;
          lines += `     ID: ${s.id}\n\n`;
        }

        return brandedGuide(
          lines,
          "告诉我 '删除对话 [ID]' 来删除某个对话，或 '清空所有对话' 批量删除"
        );
      } catch (e) {
        return branded(`[Sessions] 列出对话失败\n\n${(e as Error).message}`);
      }
    }
  );

  // delete_session
  server.tool(
    "delete_session",
    "Delete a specific Claude Code conversation session",
    {
      session_id: z.string().describe("Session ID to delete (from list_sessions)"),
    },
    async ({ session_id }) => {
      try {
        // Check sessions dir
        const sessionFile = path.join(CLAUDE_SESSIONS, `${session_id}.json`);
        const deleted: string[] = [];

        if (await pathExists(sessionFile)) {
          await fs.unlink(sessionFile);
          deleted.push(sessionFile);
        }

        // Check project dirs for .jsonl
        if (await pathExists(CLAUDE_PROJECTS)) {
          const projectDirs = await listDir(CLAUDE_PROJECTS);
          for (const dir of projectDirs) {
            const jsonlFile = path.join(CLAUDE_PROJECTS, dir, `${session_id}.jsonl`);
            if (await pathExists(jsonlFile)) {
              await fs.unlink(jsonlFile);
              deleted.push(jsonlFile);
            }
          }
        }

        if (deleted.length === 0) {
          return branded(
            `[Sessions] 删除失败\n\n  未找到 ID 为 ${session_id} 的对话\n\n告诉我 '列出对话' 查看所有对话`
          );
        }

        return brandedGuide(
          `[Sessions] 删除成功\n\n  ID: ${session_id}\n  已删除: ${deleted.length} 个文件`,
          "告诉我 '列出对话' 确认删除结果"
        );
      } catch (e) {
        return branded(`[Sessions] 删除失败\n\n${(e as Error).message}`);
      }
    }
  );

  // clear_sessions
  server.tool(
    "clear_sessions",
    "Delete all Claude Code conversation sessions (dangerous!)",
    {
      project_path: z.string().optional().describe("Only clear sessions for this project (omit to clear all)"),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    async ({ project_path, confirm }) => {
      try {
        if (!confirm) {
          return branded(
            `[Sessions] 需要确认\n\n清空对话是危险操作，请设置 confirm=true 确认。`
          );
        }

        let deleted = 0;

        if (project_path) {
          // Clear only project sessions
          const hash = project_path.replace(/\//g, "-");
          const projDir = path.join(CLAUDE_PROJECTS, hash);
          if (await pathExists(projDir)) {
            const files = await listDir(projDir);
            for (const f of files) {
              if (f.endsWith(".jsonl")) {
                await fs.unlink(path.join(projDir, f));
                deleted++;
              }
            }
          }
        } else {
          // Clear all sessions
          if (await pathExists(CLAUDE_SESSIONS)) {
            const files = await listDir(CLAUDE_SESSIONS);
            for (const f of files) {
              const fp = path.join(CLAUDE_SESSIONS, f);
              if (f.endsWith(".json") && !(await isDirectory(fp))) {
                await fs.unlink(fp);
                deleted++;
              }
            }
          }

          // Clear project-level .jsonl
          if (await pathExists(CLAUDE_PROJECTS)) {
            const projectDirs = await listDir(CLAUDE_PROJECTS);
            for (const dir of projectDirs) {
              const dirPath = path.join(CLAUDE_PROJECTS, dir);
              if (!(await isDirectory(dirPath))) continue;
              const files = await listDir(dirPath);
              for (const f of files) {
                if (f.endsWith(".jsonl")) {
                  await fs.unlink(path.join(dirPath, f));
                  deleted++;
                }
              }
            }
          }
        }

        return branded(
          `[Sessions] 清空完成\n\n  已删除: ${deleted} 个对话文件\n  ${project_path ? `范围: ${project_path}` : "范围: 所有项目"}`
        );
      } catch (e) {
        return branded(`[Sessions] 清空失败\n\n${(e as Error).message}`);
      }
    }
  );
}
