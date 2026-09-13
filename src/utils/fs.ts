import fs from "fs/promises";
import path from "path";

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T = unknown>(p: string): Promise<T> {
  const content = await fs.readFile(p, "utf-8");
  return JSON.parse(content) as T;
}

export async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function readText(p: string): Promise<string> {
  return fs.readFile(p, "utf-8");
}

export async function writeText(p: string, content: string): Promise<void> {
  await fs.writeFile(p, content, "utf-8");
}

export async function listDir(p: string): Promise<string[]> {
  try {
    return await fs.readdir(p);
  } catch {
    return [];
  }
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await listDir(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    if (entry.endsWith(".md")) {
      files.push(fullPath);
    } else if (await isDirectory(fullPath)) {
      const nested = await findMarkdownFiles(fullPath);
      files.push(...nested);
    }
  }
  return files;
}
