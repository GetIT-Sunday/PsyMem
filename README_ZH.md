<a name="psymem"></a>
<p align="center">
  <img src="assets/banner.png" alt="PsyMem banner" width="100%">
</p>

<p align="center">
  <h1 align="center">🧠 PsyMem</h1>
  <p align="center">
    <strong>Claude Code 的记忆与配置管理 MCP Server</strong><br>
    <em>在 Claude Code 对话中直接管理记忆文件、MCP 服务器和 Skills 商城</em>
  </p>
  <p align="center">
    <a href="#-功能特性">功能特性</a> •
    <a href="#-安装">安装</a> •
    <a href="#-使用方法">使用方法</a> •
    <a href="#-工具列表-15-个">工具列表</a>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/node-18+-yellow?style=flat-square" alt="Node">
  <img src="https://img.shields.io/badge/MCP-服务器-8B5CF6?style=flat-square" alt="MCP">
  <img src="https://img.shields.io/badge/Claude_Code-就绪-E8534A?style=flat-square" alt="Claude Code">
  <img src="https://img.shields.io/github/stars/GetIT-Sunday/PsyMem?style=social" alt="Stars">
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>中文</strong>
</p>

---

## ✨ 功能特性

<table>
  <tr>
    <td width="50%">
      <h3>🗂️ 记忆管理</h3>
      <ul>
        <li>查看所有项目及其记忆文件状态</li>
        <li>读取 / 写入 / 删除项目记忆文件</li>
        <li>用模板初始化记忆：<code>project</code>、<code>personal</code>、<code>security</code></li>
        <li>跨项目搜索记忆内容</li>
      </ul>
    </td>
    <td width="50%">
      <h3>⚙️ MCP Server 管理</h3>
      <ul>
        <li>查看已配置的 MCP Server（全局 + 项目级 <code>.mcp.json</code>）</li>
        <li>添加 / 删除 / 修改 MCP Server 配置</li>
        <li>同时管理用户级和项目级服务器</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🛒 Skills 商城</h3>
      <ul>
        <li>浏览 Claude Code Skills 商城</li>
        <li>按分类筛选：development、security、monitoring 等</li>
        <li>按推荐排序（厂商署名的优先）</li>
        <li>直接在 Claude Code 中安装 Skill</li>
      </ul>
    </td>
    <td width="50%">
      <h3>🔧 零摩擦接入</h3>
      <ul>
        <li>一条 <code>claude mcp add</code> 命令完成注册</li>
        <li>重启 Claude Code 即可生效</li>
        <li>TypeScript + MCP SDK + Zod 验证</li>
        <li>15 个工具，自然语言交互</li>
      </ul>
    </td>
  </tr>
</table>

<div align="right"><a href="#psymem">↑ 返回顶部</a></div>

---

## 📦 安装

```bash
git clone https://github.com/GetIT-Sunday/PsyMem.git
cd PsyMem
npm install
npm run build
```

注册为 Claude Code MCP Server：

```bash
claude mcp add -s user psymem -- node /path/to/PsyMem/dist/index.js
```

重启 Claude Code 后即可使用。

<div align="right"><a href="#psymem">↑ 返回顶部</a></div>

---

## 💬 使用方法

在 Claude Code 对话中直接用自然语言：

```
帮我看看我有哪些项目和记忆文件
初始化这个项目的 CLAUDE.md
搜索所有记忆中包含 "TypeScript" 的内容
我配了哪些 MCP servers
搜索 security 相关的 skills
查看 skill semgrep 的详情
安装 skill security-guidance
```

<div align="right"><a href="#psymem">↑ 返回顶部</a></div>

---

## 🛠️ 工具列表（15 个）

| 工具 | 说明 |
|------|------|
| `list_projects` | 列出所有项目及记忆状态 |
| `read_memory` | 读取项目记忆文件 |
| `write_memory` | 创建或更新记忆文件 |
| `delete_memory` | 删除记忆文件 |
| `init_memory` | 用模板初始化记忆 |
| `search_memories` | 跨项目搜索记忆 |
| `list_mcp_servers` | 列出已配置的 MCP Server |
| `add_mcp_server` | 添加 MCP Server |
| `remove_mcp_server` | 删除 MCP Server |
| `update_mcp_server` | 修改 MCP Server 配置 |
| `list_skills` | 浏览 Skills 商城 |
| `list_categories` | 列出所有 Skills 分类 |
| `read_skill` | 查看 Skill 详情 |
| `search_skills` | 搜索 Skills |
| `install_skill` | 安装 Skill |

<div align="right"><a href="#psymem">↑ 返回顶部</a></div>

---

## 🧪 开发

```bash
npm run build    # 编译 TypeScript
npm start        # 启动 MCP Server
```

<div align="right"><a href="#psymem">↑ 返回顶部</a></div>

---

## 📄 许可证

MIT — 详见 [LICENSE](LICENSE)

---

<p align="center">
  <strong>⭐ 如果 PsyMem 改善了你的 Claude Code 工作流，请给一个 Star！</strong>
</p>

<p align="center">
  <a href="https://star-history.com/#GetIT-Sunday/PsyMem&Date">
    <img src="https://api.star-history.com/svg?repos=GetIT-Sunday/PsyMem&type=Date" alt="Star History Chart" width="600">
  </a>
</p>

<p align="center">
  <sub>Made with ✨ by <a href="https://github.com/GetIT-Sunday">GetIT-Sunday</a> using <a href="https://github.com/GetIT-Sunday/ReadmeMagic-github-readme-design-skill">ReadmeMagic</a></sub>
</p>
