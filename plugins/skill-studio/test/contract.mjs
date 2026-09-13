#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const server = spawn(process.execPath, [path.join(pluginRoot, "server/index.mjs")], {
  cwd: path.resolve(pluginRoot, "../.."),
  env: { ...process.env, PLUGIN_ROOT: pluginRoot },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let nextId = 1;
const waiting = new Map();

server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const newline = buffer.indexOf("\n");
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    const waiter = waiting.get(message.id);
    if (!waiter) continue;
    waiting.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  }
});

function rpc(method, params = {}) {
  const id = nextId++;
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

try {
  await rpc("initialize", { protocolVersion: "2025-06-18" });
  const tools = await rpc("tools/list");
  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  assert(toolNames.has("render_skill_studio"));
  assert(toolNames.has("publish_skill_context"));

  const render = await rpc("tools/call", {
    name: "render_skill_studio",
    arguments: { skill: "skill-studio" },
  });
  assert.match(render.content[0].text, /Skill Studio is open/);
  assert.equal(render.structuredContent.context.skill, "skill-studio");
  assert.equal(render.structuredContent.context.editor.dirty, false);

  const published = await rpc("tools/call", {
    name: "publish_skill_context",
    arguments: { name: "skill-studio", editing: true, dirty: true, diffVisible: true },
  });
  assert.match(published.content[0].text, /unsaved changes/);
  assert.match(published.content[0].text, /View: Diff/);
  assert.equal(published.structuredContent.context.editor.dirty, true);
  assert.equal(published.structuredContent.context.editor.diffVisible, true);

  console.log("Skill Studio MCP contract passed.");
} finally {
  server.stdin.end();
  server.kill();
}
