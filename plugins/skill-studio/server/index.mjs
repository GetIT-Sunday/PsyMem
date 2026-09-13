#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER_NAME = "skill-studio";
const SERVER_VERSION = "0.1.0";
const UI_URI = "ui://skill-studio/main.html";
const UI_MIME = "text/html;profile=mcp-app";
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SCAN_DEPTH = 8;
const FORK_MARKER = ".skill-studio.json";
const UI_FILE = new URL("../ui/main.html", import.meta.url);

process.stdin.setEncoding("utf8");
let buffer = "";
const pending = new Set();

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line) {
      const task = handleMessage(line);
      pending.add(task);
      void task.finally(() => pending.delete(task));
    }
  }
});

process.stdin.on("end", async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});

async function handleMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    return;
  }

  if (message.method === "initialize") {
    return respond(message.id, {
      protocolVersion: message.params?.protocolVersion ?? "2024-11-05",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }

  if (message.method === "tools/list") {
    return respond(message.id, { tools: toolDefinitions() });
  }

  if (message.method === "resources/list") {
    return respond(message.id, {
      resources: [{
        uri: UI_URI,
        name: "Skill Studio",
        description: "Workspace for browsing installed Codex Skills and editing marked personal forks.",
        mimeType: UI_MIME,
      }],
    });
  }

  if (message.method === "resources/read") {
    try {
      return respond(message.id, await readResource(message.params?.uri));
    } catch (error) {
      return respondError(message.id, -32001, error instanceof Error ? error.message : String(error));
    }
  }

  if (message.method === "tools/call") {
    try {
      return respond(message.id, await callTool(message.params?.name, message.params?.arguments ?? {}));
    } catch (error) {
      return respond(message.id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      });
    }
  }

  if (message.id !== undefined) {
    respondError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

function toolDefinitions() {
  return [
    {
      name: "list_skills",
      description: "List locally discoverable Codex Skills with their source and description.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional case-insensitive name or description filter." },
        },
        additionalProperties: false,
      },
    },
    {
      name: "inspect_skill",
      description: "Read a Skill's SKILL.md and summarize its supporting files. This tool is read-only.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name or path returned by list_skills." },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    {
      name: "fork_skill",
      description: "Create a personal editable copy of a Skill. Original plugin and cache files remain untouched.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name or path returned by list_skills." },
          targetName: { type: "string", description: "Optional directory name under the personal Skills directory." },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    {
      name: "write_skill_prompt",
      description: "Save a complete SKILL.md Prompt into a Skill Studio personal fork. Only marked personal forks can be written.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Personal fork name or path." },
          content: { type: "string", description: "Complete replacement SKILL.md content." },
        },
        required: ["name", "content"],
        additionalProperties: false,
      },
    },
    {
      name: "restore_skill_prompt",
      description: "Restore a personal fork's SKILL.md from the original recorded source.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", description: "Personal fork name or path." } },
        required: ["name"],
        additionalProperties: false,
      },
    },
    {
      name: "diff_skill_prompt",
      description: "Compare a personal fork's SKILL.md with the original recorded source.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", description: "Personal fork name or path." } },
        required: ["name"],
        additionalProperties: false,
      },
    },
    {
      name: "render_skill_studio",
      description: "Open the Skill Studio workspace. It is read-first and can edit only explicit personal forks. Optionally provide a search query or Skill name for its initial selection.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional case-insensitive filter to apply when the workspace opens." },
          skill: { type: "string", description: "Optional Skill name to select when the workspace opens." },
        },
        additionalProperties: false,
      },
      _meta: {
        ui: { resourceUri: UI_URI },
        "openai/toolInvocation/invoking": "Opening Skill Studio…",
        "openai/toolInvocation/invoked": "Skill Studio opened.",
      },
    },
    {
      name: "publish_skill_context",
      description: "Publish the current Skill Studio selection as a concise, human-readable conversation update.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Selected Skill name or path returned by list_skills." },
          editing: { type: "boolean", description: "Whether the Skill is currently open in the editor." },
          dirty: { type: "boolean", description: "Whether the editor contains unsaved changes." },
          diffVisible: { type: "boolean", description: "Whether the Diff view is currently visible." },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  ];
}

async function callTool(name, args) {
  if (name === "list_skills") return makeResult(await listSkills(args.query));
  if (name === "inspect_skill") return makeResult(await inspectSkill(args.name));
  if (name === "fork_skill") return makeResult(await forkSkill(args.name, args.targetName));
  if (name === "write_skill_prompt") return makeResult(await writeSkillPrompt(args.name, args.content));
  if (name === "restore_skill_prompt") return makeResult(await restoreSkillPrompt(args.name));
  if (name === "diff_skill_prompt") return makeResult(await diffSkillPrompt(args.name));
  if (name === "render_skill_studio") {
    const skills = (await listSkills(args.query)).skills;
    const selectedName = typeof args.skill === "string" ? args.skill.trim().toLowerCase() : "";
    const selected = selectedName
      ? skills.find((skill) => skill.name.toLowerCase() === selectedName && skill.preferred)
        ?? skills.find((skill) => skill.name.toLowerCase() === selectedName)
        ?? skills.find((skill) => skill.path === args.skill)
        ?? null
      : null;
    const data = {
      count: skills.length,
      query: typeof args.query === "string" ? args.query : "",
      skills,
      selected: selected ? await inspectSkill(selected.name) : null,
      readOnly: !selected?.editable,
    };
    return makeConversationResult(data, "Skill Studio is open.");
  }
  if (name === "publish_skill_context") {
    const selected = await inspectSkill(args.name);
    return makeConversationResult({
      selected,
      editing: Boolean(args.editing),
      dirty: Boolean(args.dirty),
      diffVisible: Boolean(args.diffVisible),
    }, "Skill Studio context shared with this conversation.");
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function readResource(uri) {
  if (uri !== UI_URI) throw new Error(`Resource not found: ${uri}`);
  const text = await fs.readFile(UI_FILE, "utf8");
  return {
    contents: [{
      uri: UI_URI,
      mimeType: UI_MIME,
      text,
      _meta: {
        ui: {
          prefersBorder: false,
          csp: { connectDomains: [], resourceDomains: [] },
        },
      },
    }],
  };
}

async function listSkills(query) {
  const roots = await skillRoots();
  const found = [];
  const seen = new Set();

  for (const root of roots) {
    await collectSkills(root, found, seen, 0);
  }

  await decoratePrecedence(found);

  const normalizedQuery = typeof query === "string" ? query.trim().toLowerCase() : "";
  const filtered = normalizedQuery
    ? found.filter((skill) => `${skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(normalizedQuery))
    : found;

  return {
    count: filtered.length,
    roots: roots.map((root) => ({ source: root.source, path: root.path, precedenceRank: root.precedenceRank, precedenceLabel: root.precedenceLabel })),
    skills: filtered.sort((a, b) => a.name.localeCompare(b.name) || Number(b.preferred) - Number(a.preferred) || a.precedenceRank - b.precedenceRank),
  };
}

async function inspectSkill(nameOrPath) {
  if (typeof nameOrPath !== "string" || !nameOrPath.trim()) {
    throw new Error("inspect_skill requires a Skill name or path.");
  }

  const requested = nameOrPath.trim();
  const match = await findSkill(requested);

  const content = await readLimitedFile(match.skillFile);
  const files = await listFiles(match.path);
  const marker = await readForkMarker(match.path);
  return {
    ...match,
    skillFile: match.skillFile,
    content,
    files,
    editable: Boolean(marker),
    fork: marker,
    readOnly: !marker,
  };
}

async function skillRoots() {
  const cwd = process.cwd();
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const roots = [
    { path: path.join(cwd, ".agents", "skills"), source: "project .agents/skills", precedenceRank: 1, precedenceLabel: "Project .agents" },
    { path: path.join(cwd, ".codex", "skills"), source: "project .codex/skills", precedenceRank: 2, precedenceLabel: "Project .codex" },
    { path: path.join(codexHome, "skills"), source: "personal ~/.codex/skills", precedenceRank: 3, precedenceLabel: "Personal Skills" },
    { path: path.join(codexHome, "plugins", "cache"), source: "plugin cache", precedenceRank: 5, precedenceLabel: "Plugin cache" },
  ];

  if (process.env.PLUGIN_ROOT) {
    roots.push({ path: path.join(process.env.PLUGIN_ROOT, "skills"), source: "current plugin", precedenceRank: 4, precedenceLabel: "Current plugin" });
  }

  return uniqueRoots(roots);
}

function uniqueRoots(roots) {
  const seen = new Set();
  return roots.filter((root) => {
    const resolved = path.resolve(root.path);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });
}

async function collectSkills(root, result, seen, depth) {
  if (depth > MAX_SCAN_DEPTH || !(await isDirectory(root.path))) return;

  const skillFile = path.join(root.path, "SKILL.md");
  if (await isFile(skillFile)) {
    const content = await readLimitedFile(skillFile);
    const metadata = parseFrontmatter(content);
    const resolved = path.resolve(root.path);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      result.push({
        name: metadata.name || path.basename(root.path),
        description: metadata.description || "No description",
        path: resolved,
        skillFile,
        source: root.source,
        precedenceRank: root.precedenceRank,
        precedenceLabel: root.precedenceLabel,
      });
    }
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(root.path, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) await collectSkills({ ...root, path: path.join(root.path, entry.name) }, result, seen, depth + 1);
  }
}

async function decoratePrecedence(skills) {
  const groups = new Map();
  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(skill);
    const marker = await readForkMarker(skill.path);
    skill.editable = Boolean(marker);
    skill.forkName = marker ? path.basename(skill.path) : null;
  }

  for (const group of groups.values()) {
    group.sort((a, b) => Number(b.editable) - Number(a.editable) || a.precedenceRank - b.precedenceRank || a.path.localeCompare(b.path));
    group.forEach((skill, index) => {
      skill.preferred = index === 0;
      skill.versionCount = group.length;
      skill.versionStatus = skill.preferred ? (skill.editable ? "personal override" : "preferred") : "shadowed";
    });
  }
}

async function findSkill(nameOrPath) {
  if (typeof nameOrPath !== "string" || !nameOrPath.trim()) {
    throw new Error("A Skill name or path is required.");
  }
  const requested = nameOrPath.trim();
  const skills = (await listSkills()).skills;
  const requestedPath = path.resolve(requested);
  const requestedRealPath = await fs.realpath(requestedPath).catch(() => requestedPath);
  let match = null;
  for (const skill of skills) {
    const skillPath = path.resolve(skill.path);
    const skillRealPath = await fs.realpath(skillPath).catch(() => skillPath);
    if (skillPath === requestedPath || skillRealPath === requestedRealPath) {
      match = skill;
      break;
    }
  }
  match ??= skills.find((skill) => skill.name.toLowerCase() === requested.toLowerCase() && skill.preferred)
    ?? skills.find((skill) => skill.forkName?.toLowerCase() === requested.toLowerCase())
    ?? skills.find((skill) => skill.name.toLowerCase() === requested.toLowerCase());
  if (!match) throw new Error(`Skill not found: ${requested}`);
  return match;
}

function personalSkillsRoot() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.resolve(path.join(codexHome, "skills"));
}

function safeSkillDirectoryName(value) {
  const name = String(value || "").trim();
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    throw new Error("targetName must be a simple Skill directory name.");
  }
  return name;
}

async function readForkMarker(skillPath) {
  const markerPath = path.join(skillPath, FORK_MARKER);
  try {
    const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
    if (!marker || typeof marker.forkedFrom !== "string") return null;
    return marker;
  } catch {
    return null;
  }
}

async function forkSkill(nameOrPath, targetName) {
  const source = await findSkill(nameOrPath);
  if (source.editable) throw new Error("This Skill is already a Skill Studio personal fork.");
  const destinationName = safeSkillDirectoryName(targetName || `${source.name}-personal`);
  const root = personalSkillsRoot();
  const destination = path.join(root, destinationName);
  await fs.mkdir(root, { recursive: true });
  if (await isDirectory(destination) || await isFile(destination)) {
    throw new Error(`Personal Skill already exists: ${destinationName}`);
  }
  await fs.cp(source.path, destination, { recursive: true, errorOnExist: true, force: false });
  const marker = {
    format: 1,
    forkedFrom: source.path,
    sourceName: source.name,
    sourcePrecedence: source.precedenceLabel,
    forkedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(destination, FORK_MARKER), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  return inspectSkill(destination);
}

async function requireEditableFork(nameOrPath) {
  const skill = await findSkill(nameOrPath);
  if (skill.source !== "personal ~/.codex/skills" || !skill.editable) {
    throw new Error("Only marked personal Skill Studio forks can be edited.");
  }
  const root = await fs.realpath(personalSkillsRoot()).catch(() => path.resolve(personalSkillsRoot()));
  const resolved = await fs.realpath(skill.path).catch(() => path.resolve(skill.path));
  if (!(resolved === root || resolved.startsWith(`${root}${path.sep}`)) && !skill.path.startsWith(`${personalSkillsRoot()}${path.sep}`)) {
    throw new Error("Only Skills under the personal Skills directory can be edited.");
  }
  const marker = await readForkMarker(resolved);
  if (!marker) throw new Error("This Skill is not a Skill Studio personal fork. Fork it before editing.");
  return { skill, marker };
}

async function writeSkillPrompt(nameOrPath, content) {
  if (typeof content !== "string") throw new Error("content must be the complete SKILL.md text.");
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error(`Skill file is larger than ${MAX_FILE_BYTES} bytes.`);
  const { skill } = await requireEditableFork(nameOrPath);
  const metadata = parseFrontmatter(content);
  if (!metadata.name || metadata.name.toLowerCase() !== skill.name.toLowerCase()) {
    throw new Error(`SKILL.md name must remain "${skill.name}" while editing a personal fork.`);
  }
  const temporary = `${skill.skillFile}.tmp-${process.pid}`;
  try {
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, skill.skillFile);
  } finally {
    try { await fs.unlink(temporary); } catch {}
  }
  return inspectSkill(skill.path);
}

async function restoreSkillPrompt(nameOrPath) {
  const { skill, marker } = await requireEditableFork(nameOrPath);
  const originalFile = await recordedSourceFile(marker);
  const original = await readLimitedFile(originalFile);
  return writeSkillPrompt(skill.path, original);
}

async function diffSkillPrompt(nameOrPath) {
  const { skill, marker } = await requireEditableFork(nameOrPath);
  const originalFile = await recordedSourceFile(marker);
  const original = await readLimitedFile(originalFile);
  const current = await readLimitedFile(skill.skillFile);
  return {
    name: skill.name,
    path: skill.path,
    originalPath: originalFile,
    changed: original !== current,
    diff: makeLineDiff(original, current),
  };
}

async function recordedSourceFile(marker) {
  const sourcePath = path.resolve(marker.forkedFrom);
  const sourceFile = path.join(sourcePath, "SKILL.md");
  const discovered = (await listSkills()).skills;
  const sourceRealPath = await fs.realpath(sourcePath).catch(() => sourcePath);
  let isKnownSource = false;
  for (const skill of discovered) {
    if (skill.editable) continue;
    const skillRealPath = await fs.realpath(path.resolve(skill.path)).catch(() => path.resolve(skill.path));
    if (skillRealPath === sourceRealPath) { isKnownSource = true; break; }
  }
  if (!isKnownSource || !(await isFile(sourceFile))) {
    throw new Error("The recorded source Skill is no longer available for comparison.");
  }
  return sourceFile;
}

function makeLineDiff(original, current) {
  const before = original.split("\n");
  const after = current.split("\n");
  const lines = [];
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    if (before[index] === after[index]) lines.push(`  ${before[index] ?? ""}`);
    else {
      if (before[index] !== undefined) lines.push(`- ${before[index]}`);
      if (after[index] !== undefined) lines.push(`+ ${after[index]}`);
    }
  }
  return lines.join("\n");
}

function parseFrontmatter(content) {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end === -1) return {};
  const metadata = {};
  for (const line of content.slice(3, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (key) metadata[key] = value;
  }
  return metadata;
}

async function listFiles(root) {
  const files = [];
  await collectFiles(root, root, files, 0);
  return files.sort();
}

async function collectFiles(root, current, result, depth) {
  if (depth > MAX_SCAN_DEPTH) return;
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) await collectFiles(root, fullPath, result, depth + 1);
    else result.push(path.relative(root, fullPath));
  }
}

async function readLimitedFile(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size > MAX_FILE_BYTES) throw new Error(`Skill file is larger than ${MAX_FILE_BYTES} bytes: ${filePath}`);
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

async function isFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(directoryPath) {
  try {
    return (await fs.stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

function makeResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function makeConversationResult(value, heading) {
  const selected = value.selected;
  const context = selected ? makeContextSnapshot(selected, value) : null;
  const lines = [heading];
  if (selected) {
    const active = context.activeVersion.label;
    lines.push(`Skill: ${selected.name}`);
    lines.push(`Active version: ${active}`);
    lines.push(`Source: ${selected.source}`);
    lines.push(`Path: ${selected.skillFile}`);
    if (selected.versionCount > 1) lines.push(`Resolution: ${selected.versionStatus}; ${selected.versionCount} versions found`);
    if (context.editor.open) lines.push(`Editor: ${context.editor.dirty ? "unsaved changes" : "editing"}`);
    if (context.editor.diffVisible) lines.push("View: Diff");
  } else {
    lines.push("No Skill is selected yet.");
  }
  lines.push("The Skill Studio selection is available to the model for follow-up analysis.");
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    structuredContent: { ...value, context },
  };
}

function makeContextSnapshot(selected, value = {}) {
  return {
    version: 1,
    skill: selected.name,
    activeVersion: {
      label: selected.editable ? "Personal override (active)" : (selected.precedenceLabel || "Resolved version"),
      source: selected.source,
      path: selected.skillFile,
      precedenceRank: selected.precedenceRank ?? null,
      preferred: Boolean(selected.preferred || selected.editable),
    },
    editor: {
      open: Boolean(value.editing),
      dirty: Boolean(value.dirty),
      diffVisible: Boolean(value.diffVisible),
    },
  };
}

function respond(id, result) {
  if (id === undefined) return;
  writeMessage({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
