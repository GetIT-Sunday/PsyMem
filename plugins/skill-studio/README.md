# Skill Studio

Skill Studio now has a read-first inspection flow plus a guarded personal-fork editing flow. It gives Codex seven data MCP tools and one MCP Apps render tool:

- `list_skills`: discover project, personal, plugin-cache, and current-plugin Skills.
- `inspect_skill`: read a Skill's `SKILL.md` and list its supporting files.
- `fork_skill`: copy a Skill into the personal Skills directory and record its origin.
- `write_skill_prompt`: save a complete `SKILL.md` into a marked personal fork.
- `restore_skill_prompt`: restore a personal fork from its recorded source.
- `diff_skill_prompt`: compare a personal fork with its recorded source.
- `render_skill_studio`: open the Codex-hosted Skill Studio workspace, optionally focused on a Skill. The tool result leaves a concise status summary in the conversation.
- `publish_skill_context`: publish the current selection, active version, and edit/Diff state as a human-readable conversation update.

The render tool serves `ui://skill-studio/main.html` using the MCP Apps MIME type. The UI is a three-pane workspace: a searchable Skill library, the full Prompt source, and a source/file inspector. It calls the data tools through the standard `ui/*` JSON-RPC bridge and falls back to a small standalone preview when opened outside a host.

## Version precedence

Same-named Skills are retained as separate versions. The active version is resolved in this order:

1. An explicit Skill Studio personal fork (`personal override`).
2. Project `.agents/skills`.
3. Project `.codex/skills`.
4. Personal `~/.codex/skills`.
5. The current plugin.
6. The plugin cache.

The list marks `Preferred`, `Personal override`, or `Shadowed`, and the Inspector shows the source that won resolution. A personal fork is intentionally promoted above its recorded source so editing it changes the version Codex will select.

The plugin treats inspected Skill content as untrusted data. Write operations are limited to directories under the personal Skills root that contain Skill Studio's origin marker; plugin cache and project Skills remain read-only.

## Use it from a Codex conversation

You do not need to open the HTML file in normal use. In a Codex task, ask for example:

- `Show me the installed Skills and open Skill Studio.`
- `Inspect the frontend-app-builder Skill before using it.`
- `Explain this Skill, then wait for my approval.`

Codex responds by rendering Skill Studio inline in the conversation. Select a Skill to inspect its full Prompt and the version that will win resolution. From the embedded panel:

- `Explain this Skill` sends a read-only follow-up request back to the same conversation.
- `Use this version` tells Codex to use the currently preferred version for the next request.
- `Share selection` publishes a visible summary containing the selected Skill, source, editor state, and Diff state.

The panel keeps its selection in model context with `ui/update-model-context`, so the next turn can refer to “the Skill currently open in Studio” without pasting the entire Prompt. Editing remains inside Skill Studio; the conversation is the control surface for deciding when to inspect, explain, or continue.

## Try the workflow before connecting Codex

Opening `ui/main.html` directly now starts a local preview sandbox. It uses the same interaction model as the embedded MCP App, but never writes to the real `~/.codex/skills` directory:

1. Select a Skill and click `Fork personal copy`.
2. Edit the generated personal version and watch the conversation bar change to `unsaved changes`.
3. Save, open `Diff`, and use `Share selection` to publish the active-version state.
4. Reload the page to confirm the preview fork and its preferred-version status persist.

Preview forks are stored only in the browser's `localStorage` under `skill-studio.preview-forks`. When the same UI is opened through Codex, these preview handlers are replaced by the MCP tools above, so Fork/Save/Restore operate on marked personal Skill directories with the server's safety checks.

## Conversation + Studio context

The embedded UI sends `ui/update-model-context` whenever the selected Skill, resolved version, editor state, or Diff view changes. This keeps the current Studio state available for follow-up questions in the same Codex task without copying the whole Prompt into the chat.

The `Share selection` action calls `publish_skill_context` when an explicit, visible conversation update is useful. On narrow screens the automatic context link remains visible while the optional share button is hidden to preserve the editor layout.

The reusable brand mark is stored at `design/skill-studio-icon.svg`; the embedded UI inlines the same geometry so the plugin still works as a single self-contained MCP App resource.

## Local development

Validate the plugin from the repository root:

```bash
python3 /Users/wengchuangchuang/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/skill-studio
```

The MCP server can be exercised directly over stdio:

```bash
PLUGIN_ROOT="$PWD/plugins/skill-studio" \
  node plugins/skill-studio/server/index.mjs
```

Run the protocol contract test:

```bash
node plugins/skill-studio/test/contract.mjs
```
