import path from "path";
import os from "os";

const HOME = os.homedir();

export const CLAUDE_DIR = path.join(HOME, ".claude");
export const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, "settings.json");
export const CLAUDE_PROJECTS = path.join(CLAUDE_DIR, "projects");
export const CLAUDE_GLOBAL_MEMORIES = path.join(CLAUDE_DIR, "memories");
export const CLAUDE_PLUGINS = path.join(CLAUDE_DIR, "plugins");
export const CLAUDE_SESSIONS = path.join(CLAUDE_DIR, "sessions");

/** Convert a filesystem path to the Claude Code project hash format */
export function pathToProjectHash(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

/** Convert a Claude Code project hash back to a filesystem path */
export function projectHashToPath(hash: string): string {
  // Hash format: leading dash = root slash, e.g. "-Users-foo" -> "/Users/foo"
  const p = hash.replace(/-/g, "/");
  return p.startsWith("//") ? p.slice(1) : p;
}
