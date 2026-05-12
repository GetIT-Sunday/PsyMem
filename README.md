# PsyMem

Claude Code 的记忆与配置管理 MCP Server。在 Claude Code 对话中直接管理记忆文件、MCP Server 配置和 Skills 商城。

## 功能

### 记忆管理
- 查看所有项目及其记忆文件状态
- 读取 / 写入项目的记忆文件（CLAUDE.md、MEMORY.md 等）
- 跨项目搜索记忆内容

### MCP Server 管理
- 查看已配置的 MCP Server
- 添加 / 删除 / 修改 MCP Server 配置

### Skills 商城
- 搜索和浏览 Claude Code 插件商城
- 按分类筛选（development、security、monitoring 等）
- 按推荐排序（有厂商署名的优先）

## 安装

```bash
git clone <repo-url>
cd PsyMem
npm install
npm run build
```

注册为 Claude Code MCP Server：

```bash
claude mcp add -s user psymem -- node /path/to/PsyMem/dist/index.js
```

重启 Claude Code 后生效。

## 工具列表

| 工具 | 说明 |
|------|------|
| `list_projects` | 列出所有项目及记忆状态 |
| `read_memory` | 读取项目记忆文件 |
| `write_memory` | 创建或更新记忆文件 |
| `search_memories` | 跨项目搜索记忆 |
| `list_mcp_servers` | 列出已配置的 MCP Server |
| `add_mcp_server` | 添加 MCP Server |
| `remove_mcp_server` | 删除 MCP Server |
| `update_mcp_server` | 修改 MCP Server |
| `list_skills` | 浏览 Skills 商城 |
| `list_categories` | 列出所有 Skills 分类 |
| `read_skill` | 查看 Skill 详情 |
| `search_skills` | 搜索 Skills |

## 使用示例

在 Claude Code 对话中直接用自然语言：

```
帮我看看我有哪些项目和记忆文件
搜索所有记忆中包含 "TypeScript" 的内容
我配了哪些 MCP servers
搜索 security 相关的 skills
列出所有 skills 分类
```

## 开发

```bash
npm run build    # 编译 TypeScript
npm start        # 启动 MCP Server
```

## 技术栈

- TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [Zod](https://github.com/colinhacks/zod)

## License

MIT
