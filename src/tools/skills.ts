import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLAUDE_PLUGINS } from "../paths.js";
import {
  pathExists,
  listDir,
  isDirectory,
  readJson,
  readText,
  findMarkdownFiles,
} from "../utils/fs.js";
import { getCached, setCache } from "../utils/cache.js";
import { branded, brandedGuide } from "../format.js";

interface MarketplaceInfo {
  source: { source: string; repo?: string; url?: string };
  installLocation: string;
  lastUpdated: string;
}

interface PluginEntry {
  name: string;
  description: string;
  author?: { name: string };
  category?: string;
  source: unknown;
  homepage?: string;
}

interface RankedPlugin extends PluginEntry {
  marketplace: string;
  score: number;
}

async function getMarketplaces(): Promise<Record<string, MarketplaceInfo>> {
  const cached = getCached<Record<string, MarketplaceInfo>>("marketplaces");
  if (cached) return cached;
  const knownPath = path.join(CLAUDE_PLUGINS, "known_marketplaces.json");
  if (await pathExists(knownPath)) {
    const data = await readJson<Record<string, MarketplaceInfo>>(knownPath);
    setCache("marketplaces", data);
    return data;
  }
  return {};
}

async function getMarketplacePlugins(marketplaceDir: string): Promise<PluginEntry[]> {
  const cacheKey = `plugins:${marketplaceDir}`;
  const cached = getCached<PluginEntry[]>(cacheKey);
  if (cached) return cached;
  const metaPath = path.join(marketplaceDir, ".claude-plugin", "marketplace.json");
  if (await pathExists(metaPath)) {
    const meta = await readJson<{ plugins?: PluginEntry[] }>(metaPath);
    const plugins = meta.plugins || [];
    setCache(cacheKey, plugins);
    return plugins;
  }
  return [];
}

/** Score a plugin for recommended sorting */
function scorePlugin(p: PluginEntry): number {
  let score = 0;
  if (p.author?.name) score += 30;
  if (p.homepage) score += 20;
  if (p.category) score += 10;
  if (p.description.length < 200) score += 5;
  return score;
}

function formatPluginLine(p: RankedPlugin, index: number): string {
  const tags: string[] = [];
  if (p.category) tags.push(p.category);
  if (p.author?.name) tags.push(`by ${p.author.name}`);
  const tagStr = tags.length > 0 ? ` [${tags.join(" | ")}]` : "";

  let line = `  ${index}. ${p.name}${tagStr}\n`;
  line += `     ${p.description.slice(0, 100)}${p.description.length > 100 ? "..." : ""}\n`;
  if (p.homepage) {
    line += `     ${p.homepage}\n`;
  }
  return line + "\n";
}

export function registerSkillsTools(server: McpServer) {
  // list_skills
  server.tool(
    "list_skills",
    "List all available skills/plugins from installed marketplaces",
    {
      category: z
        .string()
        .optional()
        .describe("Filter by category (e.g. 'development', 'security')"),
      sort: z
        .enum(["recommended", "name", "category"])
        .optional()
        .describe("Sort order: recommended (default), name, or category"),
    },
    async ({ category, sort }) => {
      try {
        const sortBy = sort || "recommended";
        const marketplaces = await getMarketplaces();
        let allPlugins: RankedPlugin[] = [];

        for (const [name, info] of Object.entries(marketplaces)) {
          const plugins = await getMarketplacePlugins(info.installLocation);
          for (const p of plugins) {
            if (category && p.category?.toLowerCase() !== category.toLowerCase()) continue;
            allPlugins.push({
              ...p,
              marketplace: name,
              score: scorePlugin(p),
            });
          }
        }

        if (sortBy === "name") {
          allPlugins.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === "category") {
          allPlugins.sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
        } else {
          allPlugins.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        }

        if (allPlugins.length === 0) {
          return branded(
            `[Skills] ${category ? `分类 "${category}" ` : ""}没有找到 Skills\n\n告诉我 '列出所有分类' 查看可用分类`
          );
        }

        let lines = `[Skills] ${category ? `分类: ${category} | ` : ""}共 ${allPlugins.length} 个`;
        if (sortBy === "recommended") lines += " (按推荐排序)";
        lines += "\n\n";

        for (let i = 0; i < allPlugins.length; i++) {
          lines += formatPluginLine(allPlugins[i], i + 1);
        }

        return brandedGuide(
          lines,
          "告诉我 '查看 skill [名称]' 了解详情，或 '搜索 [关键词]' 精确查找"
        );
      } catch (e) {
        return branded(`[Skills] 加载失败\n\n${(e as Error).message}`);
      }
    }
  );

  // list_categories
  server.tool(
    "list_categories",
    "List all available skill/plugin categories with counts",
    {},
    async () => {
      try {
        const marketplaces = await getMarketplaces();
        const categoryMap = new Map<string, number>();

        for (const info of Object.values(marketplaces)) {
          const plugins = await getMarketplacePlugins(info.installLocation);
          for (const p of plugins) {
            const cat = p.category || "uncategorized";
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
          }
        }

        const sorted = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

        let lines = `[Skills] 所有分类 (${sorted.length} 个)\n\n`;
        for (const [cat, count] of sorted) {
          lines += `  - ${cat} (${count} 个)\n`;
        }

        return brandedGuide(
          lines,
          "告诉我 '列出 [分类名] 的 skills' 查看该分类下的所有插件"
        );
      } catch (e) {
        return branded(`[Skills] 加载分类失败\n\n${(e as Error).message}`);
      }
    }
  );

  // read_skill
  server.tool(
    "read_skill",
    "Read the contents and configuration of a specific skill/plugin",
    {
      name: z.string().describe("Name of the skill/plugin to read"),
    },
    async ({ name }) => {
      try {
        const marketplaces = await getMarketplaces();
        for (const [mktName, info] of Object.entries(marketplaces)) {
          const plugins = await getMarketplacePlugins(info.installLocation);
          const found = plugins.find(
            (p) => p.name.toLowerCase() === name.toLowerCase()
          );
          if (found) {
            const pluginDir = path.join(info.installLocation, "plugins", found.name);

            let lines = `[Skills] ${found.name}\n\n`;
            lines += `  描述: ${found.description}\n`;
            if (found.author?.name) lines += `  作者: ${found.author.name}\n`;
            if (found.category) lines += `  分类: ${found.category}\n`;
            if (found.homepage) lines += `  主页: ${found.homepage}\n`;
            lines += `  来源: ${mktName}\n`;

            if (await pathExists(pluginDir)) {
              const files = await listDir(pluginDir);
              lines += `\n  本地文件:\n`;
              for (const f of files) {
                lines += `    - ${f}\n`;
              }

              const mdFiles = await findMarkdownFiles(pluginDir);
              if (mdFiles.length > 0) {
                lines += `\n  文档摘要:\n`;
                for (const f of mdFiles) {
                  const rel = path.relative(pluginDir, f);
                  const content = await readText(f);
                  const preview = content.split("\n").slice(0, 5).join("\n");
                  lines += `    [${rel}]\n    ${preview}\n\n`;
                }
              }
            } else {
              lines += `\n  状态: 尚未本地安装\n`;
            }

            return brandedGuide(
              lines,
              `告诉我 '安装 skill ${found.name}' 来安装此 Skill`
            );
          }
        }

        return branded(
          `[Skills] 未找到 "${name}"\n\n告诉我 '搜索 ${name}' 在商城中搜索相似的 Skills`
        );
      } catch (e) {
        return branded(`[Skills] 读取失败\n\n${(e as Error).message}`);
      }
    }
  );

  // search_skills
  server.tool(
    "search_skills",
    "Search for skills/plugins by keyword across all marketplaces",
    {
      query: z.string().describe("Search keyword"),
      sort: z
        .enum(["recommended", "name", "category"])
        .optional()
        .describe("Sort order: recommended (default), name, or category"),
    },
    async ({ query, sort }) => {
      try {
        const sortBy = sort || "recommended";
        const lowerQuery = query.toLowerCase();
        const marketplaces = await getMarketplaces();
        const results: RankedPlugin[] = [];

        for (const [mktName, info] of Object.entries(marketplaces)) {
          const plugins = await getMarketplacePlugins(info.installLocation);
          for (const plugin of plugins) {
            const searchable = `${plugin.name} ${plugin.description} ${plugin.category || ""}`.toLowerCase();
            if (searchable.includes(lowerQuery)) {
              results.push({ ...plugin, marketplace: mktName, score: scorePlugin(plugin) });
            }
          }
        }

        if (sortBy === "name") {
          results.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === "category") {
          results.sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
        } else {
          results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        }

        if (results.length === 0) {
          return branded(
            `[Skills] 搜索 "${query}" 无结果\n\n试试其他关键词，或告诉我 '列出所有分类' 浏览商城`
          );
        }

        let lines = `[Skills] 搜索 "${query}" 找到 ${results.length} 个`;
        if (sortBy === "recommended") lines += " (按推荐排序)";
        lines += "\n\n";

        for (let i = 0; i < results.length; i++) {
          lines += formatPluginLine(results[i], i + 1);
        }

        return brandedGuide(
          lines,
          "告诉我 '查看 skill [名称]' 了解详情"
        );
      } catch (e) {
        return branded(`[Skills] 搜索失败\n\n${(e as Error).message}`);
      }
    }
  );

  // install_skill
  server.tool(
    "install_skill",
    "Install a skill/plugin via claude plugin install",
    {
      name: z.string().describe("Name of the skill/plugin to install"),
    },
    async ({ name }) => {
      try {
        const { execSync } = await import("child_process");
        const result = execSync(`claude plugin install ${name}`, {
          encoding: "utf-8",
          timeout: 30000,
        });
        return brandedGuide(
          `[Skills] 安装成功\n\n  插件: ${name}\n  输出: ${result.trim()}`,
          "重启 Claude Code 后生效"
        );
      } catch (e) {
        const msg = (e as Error).message;
        return branded(
          `[Skills] 安装失败\n\n  插件: ${name}\n  错误: ${msg}\n\n请确认插件名称正确，或手动执行: claude plugin install ${name}`
        );
      }
    }
  );
}
