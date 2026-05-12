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
import { branded, brandedGuide, brand, guide } from "../format.js";

export function registerMemoryTools(server: McpServer) {
  // list_projects
  server.tool(
    "list_projects",
    "List all Claude Code projects and their memory file status",
    async () => {
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

      // Build branded output
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
    }
  );

  // read_memory
  server.tool(
    "read_memory",
    "Read memory files for a specific project. Specify project_path (real filesystem path) or file to read a specific file.",
    {
      project_path: z
        .string()
        .describe("Real filesystem path of the project (e.g. /Users/foo/myapp)"),
      file: z
        .string()
        .optional()
        .describe(
          "Specific file to read relative to project memory dir (e.g. 'MEMORY.md' or 'rules/code.md'). If omitted, lists all memory files."
        ),
    },
    async ({ project_path, file }) => {
      const hash = pathToProjectHash(project_path);
      const projectDir = path.join(CLAUDE_PROJECTS, hash);

      if (!(await pathExists(projectDir))) {
        return branded(
          `[Read] 项目未找到\n\n  路径: ${project_path}\n  查找: ${projectDir}\n\n请确认项目路径是否正确。`
        );
      }

      const memoryDir = path.join(projectDir, "memory");

      if (file) {
        const filePath = path.join(memoryDir, file);
        if (!(await pathExists(filePath))) {
          return branded(
            `[Read] 文件未找到\n\n  文件: ${file}\n  完整路径: ${filePath}\n\n可用 write_memory 创建此文件。`
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
          "告诉我 '为这个项目创建 CLAUDE.md' 来开始使用记忆"
        );
      }

      const mdFiles = await findMarkdownFiles(memoryDir);
      if (mdFiles.length === 0) {
        return brandedGuide(
          `[Read] ${project_path}\n\n记忆目录存在，但没有 .md 文件。`,
          "告诉我 '写入 [文件名]，内容是 [xxx]' 来创建记忆"
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
    }
  );

  // write_memory
  server.tool(
    "write_memory",
    "Create or update a memory file for a project. Supports CLAUDE.md, MEMORY.md, or any .md file under memory/.",
    {
      project_path: z
        .string()
        .describe("Real filesystem path of the project"),
      file: z
        .string()
        .describe(
          "File path relative to project memory dir (e.g. 'MEMORY.md' or 'rules/style.md')"
        ),
      content: z.string().describe("Markdown content to write"),
    },
    async ({ project_path, file, content }) => {
      const hash = pathToProjectHash(project_path);
      const projectDir = path.join(CLAUDE_PROJECTS, hash);
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
    }
  );

  // search_memories
  server.tool(
    "search_memories",
    "Search for a keyword across all project memory files",
    {
      query: z.string().describe("Search keyword or phrase"),
      project_path: z
        .string()
        .optional()
        .describe("Limit search to a specific project path"),
    },
    async ({ query, project_path }) => {
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
        const hash = pathToProjectHash(project_path);
        const memoryDir = path.join(CLAUDE_PROJECTS, hash, "memory");
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
    }
  );
}
