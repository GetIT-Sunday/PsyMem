import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CLAUDE_PROJECTS,
  CLAUDE_GLOBAL_MEMORIES,
  projectHashToPath,
  pathToProjectHash,
} from "../paths.js";
import {
  pathExists,
  listDir,
  isDirectory,
  readText,
  writeText,
  findMarkdownFiles,
} from "../utils/fs.js";
import { branded, brandedGuide, brand } from "../format.js";

const TEMPLATES: Record<string, string> = {
  project: `# Project Memory

## Overview
<!-- 项目简要描述 -->

## Coding Standards
- <!-- 代码规范 -->

## Key Decisions
- <!-- 重要技术决策 -->

## Notes
<!-- 其他备注 -->
`,
  personal: `# Personal Preferences

## Code Style
- <!-- 代码风格偏好 -->

## Workflow
- <!-- 工作流偏好 -->

## Do Not
- <!-- 不要做的事情 -->
`,
  security: `# Security Rules

## Input Validation
- Always validate user input at system boundaries
- Never trust external data without sanitization

## Secrets
- Never commit secrets, API keys, or tokens
- Use environment variables for sensitive config

## Patterns to Avoid
- Command injection
- SQL injection
- XSS
- Path traversal
`,
};

function hashFor(projectPath: string): string {
  return pathToProjectHash(projectPath);
}

export function registerMemoryTools(server: McpServer) {
  // list_projects
  server.tool(
    "list_projects",
    "List all Claude Code projects and their memory file status. IMPORTANT: You MUST reproduce the full list in your response text so the user can see it without expanding the tool output.",
    async () => {
      try {
        const entries = await listDir(CLAUDE_PROJECTS);
        const projects: {
          hash: string;
          realPath: string;
          memoryFiles: string[];
          sessions: number;
        }[] = [];

        for (const entry of entries) {
          const entryPath = path.join(CLAUDE_PROJECTS, entry);
          if (!(await isDirectory(entryPath))) continue;

          const memoryDir = path.join(entryPath, "memory");
          const memoryFiles: string[] = [];

          if (await pathExists(memoryDir)) {
            const mdFiles = await findMarkdownFiles(memoryDir);
            memoryFiles.push(
              ...mdFiles.map((f) => path.relative(entryPath, f))
            );
          }

          const jsonlFiles = (await listDir(entryPath)).filter((f) =>
            f.endsWith(".jsonl")
          );

          projects.push({
            hash: entry,
            realPath: projectHashToPath(entry),
            memoryFiles,
            sessions: jsonlFiles.length,
          });
        }

        const globalFiles = await findMarkdownFiles(CLAUDE_GLOBAL_MEMORIES);

        let lines = `[Memory] 项目列表 (${projects.length} 个)\n\n`;
        for (const p of projects) {
          const memStatus = p.memoryFiles.length > 0
            ? `${p.memoryFiles.length} 个记忆文件`
            : "无记忆";
          lines += `  - ${p.realPath}\n`;
          lines += `    会话: ${p.sessions} | 记忆: ${memStatus}\n`;
        }
        if (globalFiles.length > 0) {
          lines += `\n  [Global] 全局记忆: ${globalFiles.length} 个文件\n`;
        }

        return brandedGuide(
          lines,
          "选择一个项目，告诉我 '读取 [项目路径] 的记忆' 来查看内容"
        );
      } catch (e) {
        return branded(`[Memory] 列出项目失败\n\n${(e as Error).message}`);
      }
    }
  );

  // read_memory
  server.tool(
    "read_memory",
    "Read memory files for a specific project",
    {
      project_path: z.string().describe("Real filesystem path of the project"),
      file: z.string().optional().describe("Specific file to read (e.g. 'MEMORY.md' or 'rules/code.md')"),
    },
    async ({ project_path, file }) => {
      try {
        const projectDir = path.join(CLAUDE_PROJECTS, hashFor(project_path));

        if (!(await pathExists(projectDir))) {
          return branded(
            `[Read] 项目未找到\n\n  路径: ${project_path}\n  查找: ${projectDir}\n\n请确认项目路径是否正确。`
          );
        }

        const memoryDir = path.join(projectDir, "memory");

        if (file) {
          const filePath = path.join(memoryDir, file);
          if (!(await pathExists(filePath))) {
            return brandedGuide(
              `[Read] 文件未找到\n\n  文件: ${file}`,
              `告诉我 '为 ${project_path} 写入 ${file}，内容是 [xxx]' 来创建`
            );
          }
          const content = await readText(filePath);
          return brandedGuide(
            `[Read] ${file}\n\n${content}`,
            "如需修改，告诉我 '把 [内容] 写入 [文件名]'"
          );
        }

        if (!(await pathExists(memoryDir))) {
          return brandedGuide(
            `[Read] ${project_path}\n\n该项目还没有记忆目录。`,
            "告诉我 '初始化 [项目路径] 的记忆' 来创建 CLAUDE.md"
          );
        }

        const mdFiles = await findMarkdownFiles(memoryDir);
        if (mdFiles.length === 0) {
          return brandedGuide(
            `[Read] ${project_path}\n\n记忆目录存在，但没有 .md 文件。`,
            "告诉我 '初始化 [项目路径] 的记忆' 来创建初始记忆"
          );
        }

        let lines = `[Read] ${project_path} 的记忆文件\n\n`;
        for (const f of mdFiles) {
          const rel = path.relative(memoryDir, f);
          const content = await readText(f);
          const preview = content.split("\n").slice(0, 3).join("\n");
          const truncated = content.split("\n").length > 3 ? "\n  ..." : "";
          lines += `  [${rel}]\n  ${preview}${truncated}\n\n`;
        }

        return brandedGuide(
          lines,
          "告诉我 '读取 [文件名]' 查看完整内容，或 '写入 [文件名]，内容是 [xxx]' 进行修改"
        );
      } catch (e) {
        return branded(`[Memory] 读取失败\n\n${(e as Error).message}`);
      }
    }
  );

  // write_memory
  server.tool(
    "write_memory",
    "Create or update a memory file for a project",
    {
      project_path: z.string().describe("Real filesystem path of the project"),
      file: z.string().describe("File path relative to project memory dir (e.g. 'MEMORY.md' or 'rules/style.md')"),
      content: z.string().describe("Markdown content to write"),
    },
    async ({ project_path, file, content }) => {
      try {
        const projectDir = path.join(CLAUDE_PROJECTS, hashFor(project_path));
        const memoryDir = path.join(projectDir, "memory");

        const { mkdir } = await import("fs/promises");
        await mkdir(memoryDir, { recursive: true });

        const filePath = path.join(memoryDir, file);
        const fileDir = path.dirname(filePath);
        await mkdir(fileDir, { recursive: true });

        const isNew = !(await pathExists(filePath));
        await writeText(filePath, content);

        const action = isNew ? "创建" : "更新";
        return brandedGuide(
          `[Write] ${action}成功\n\n  文件: ${file}\n  项目: ${project_path}\n  大小: ${content.length} 字符`,
          `告诉我 '读取 ${file}' 来验证内容`
        );
      } catch (e) {
        return branded(`[Memory] 写入失败\n\n${(e as Error).message}`);
      }
    }
  );

  // delete_memory
  server.tool(
    "delete_memory",
    "Delete a memory file from a project",
    {
      project_path: z.string().describe("Real filesystem path of the project"),
      file: z.string().describe("File to delete relative to project memory dir (e.g. 'MEMORY.md')"),
    },
    async ({ project_path, file }) => {
      try {
        const projectDir = path.join(CLAUDE_PROJECTS, hashFor(project_path));
        const memoryDir = path.join(projectDir, "memory");
        const filePath = path.join(memoryDir, file);

        if (!(await pathExists(filePath))) {
          return branded(
            `[Delete] 文件不存在\n\n  文件: ${file}\n  项目: ${project_path}\n\n告诉我 '读取 ${project_path} 的记忆' 查看现有文件`
          );
        }

        const { unlink } = await import("fs/promises");
        await unlink(filePath);

        return brandedGuide(
          `[Delete] 删除成功\n\n  文件: ${file}\n  项目: ${project_path}`,
          `告诉我 '读取 ${project_path} 的记忆' 确认删除结果`
        );
      } catch (e) {
        return branded(`[Memory] 删除失败\n\n${(e as Error).message}`);
      }
    }
  );

  // init_memory
  server.tool(
    "init_memory",
    "Initialize a project's memory with a template (project/personal/security)",
    {
      project_path: z.string().describe("Real filesystem path of the project"),
      template: z.enum(["project", "personal", "security"]).describe("Template type: project (CLAUDE.md), personal (preferences), security (rules)"),
      file: z.string().optional().describe("Custom filename (default: CLAUDE.md for project, MEMORY.md for others)"),
    },
    async ({ project_path, template, file }) => {
      try {
        const content = TEMPLATES[template];
        if (!content) {
          return branded(`[Init] 未知模板: ${template}\n\n可用模板: ${Object.keys(TEMPLATES).join(", ")}`);
        }

        const defaultFile = template === "project" ? "CLAUDE.md" : `memory/${template}.md`;
        const targetFile = file || defaultFile;

        const projectDir = path.join(CLAUDE_PROJECTS, hashFor(project_path));
        const memoryDir = path.join(projectDir, "memory");

        const { mkdir } = await import("fs/promises");
        await mkdir(memoryDir, { recursive: true });

        const filePath = path.join(memoryDir, targetFile);
        const fileDir = path.dirname(filePath);
        await mkdir(fileDir, { recursive: true });

        if (await pathExists(filePath)) {
          return brandedGuide(
            `[Init] 文件已存在\n\n  文件: ${targetFile}\n  项目: ${project_path}`,
            `如需覆盖，告诉我 '写入 ${targetFile}，内容是 [新内容]'`
          );
        }

        await writeText(filePath, content);

        return brandedGuide(
          `[Init] 初始化成功\n\n  模板: ${template}\n  文件: ${targetFile}\n  项目: ${project_path}`,
          `告诉我 '读取 ${targetFile}' 来编辑模板内容`
        );
      } catch (e) {
        return branded(`[Memory] 初始化失败\n\n${(e as Error).message}`);
      }
    }
  );

  // search_memories
  server.tool(
    "search_memories",
    "Search for a keyword across all project memory files. IMPORTANT: You MUST reproduce the full search results in your response text so the user can see them without expanding the tool output.",
    {
      query: z.string().describe("Search keyword or phrase"),
      project_path: z.string().optional().describe("Limit search to a specific project path"),
    },
    async ({ query, project_path }) => {
      try {
        const results: {
          file: string;
          project: string;
          matches: string[];
        }[] = [];

        const lowerQuery = query.toLowerCase();

        const searchInDir = async (dir: string, projectLabel: string) => {
          if (!(await pathExists(dir))) return;
          const mdFiles = await findMarkdownFiles(dir);
          for (const f of mdFiles) {
            const content = await readText(f);
            const lines = content.split("\n");
            const matches: string[] = [];
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(lowerQuery)) {
                matches.push(`L${i + 1}: ${lines[i].trim()}`);
              }
            }
            if (matches.length > 0) {
              results.push({
                file: path.relative(dir, f),
                project: projectLabel,
                matches,
              });
            }
          }
        };

        if (project_path) {
          const memoryDir = path.join(CLAUDE_PROJECTS, hashFor(project_path), "memory");
          await searchInDir(memoryDir, project_path);
        } else {
          const entries = await listDir(CLAUDE_PROJECTS);
          for (const entry of entries) {
            const entryPath = path.join(CLAUDE_PROJECTS, entry);
            if (!(await isDirectory(entryPath))) continue;
            const memoryDir = path.join(entryPath, "memory");
            await searchInDir(memoryDir, projectHashToPath(entry));
          }
          await searchInDir(CLAUDE_GLOBAL_MEMORIES, "[global]");
        }

        if (results.length === 0) {
          return branded(
            `[Search] 搜索 "${query}" 无结果\n\n当前没有任何记忆文件包含此关键词。`
          );
        }

        let lines = `[Search] 搜索 "${query}" 找到 ${results.length} 个匹配\n\n`;
        for (const r of results) {
          lines += `  [${r.project}] ${r.file}\n`;
          for (const m of r.matches.slice(0, 5)) {
            lines += `    ${m}\n`;
          }
          if (r.matches.length > 5) {
            lines += `    ... 共 ${r.matches.length} 处匹配\n`;
          }
          lines += "\n";
        }

        return brandedGuide(
          lines,
          "告诉我 '读取 [项目路径] 的 [文件名]' 查看匹配文件的完整内容"
        );
      } catch (e) {
        return branded(`[Memory] 搜索失败\n\n${(e as Error).message}`);
      }
    }
  );
}
