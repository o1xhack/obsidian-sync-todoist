# AGENTS.md

This repository contains **Sync Todoist**, an Obsidian plugin for bidirectional task sync between Obsidian markdown and Todoist.

## Commands

```bash
npm run dev        # Development build with file watching
npm run build      # Production build (minified, no source maps)
npm run lint       # ESLint on src/
```

No automated test framework is configured. Use `test/TEST_SPEC_v2.0.0.md` for manual testing against a test vault.

## Key Constraints

- Use Obsidian's `requestUrl()` for HTTP calls. This is required for mobile compatibility.
- `data.json` is gitignored because it contains the Todoist API token at runtime.
- Commit the compiled `main.js`; Obsidian loads it directly.
- Keep `obsidian`, `electron`, `codemirror/*`, and Node built-ins external in the esbuild bundle.
- Query blocks use `sync-todoist` as the primary code block language. The original `syncist` language is kept as a migration alias.

## Attribution

This project is based on Syncist by Bastiaan Schönhage, used under the MIT License. Keep the upstream history, copyright notice, and license text intact.
