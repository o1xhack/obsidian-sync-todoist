# Pending Decisions and Known Limitations

Open items that are deliberately not solved yet, with the evidence behind them.

## Obsidian Community scanner findings (as of 2026-11-09)

Preview scans of `feature/completed-only-query-blocks` were reproduced with the public scanner in
[obsidianmd/obsidian-workflows](https://github.com/obsidianmd/obsidian-workflows) (`src/lint.ts`:
eslint 9.37.0, eslint-plugin-obsidianmd 0.4.1, typescript-eslint 8.61.1, which installs
TypeScript 6.0.x).

- **`esModuleInterop: false` in `tsconfig.json` only covers TypeScript 6.** TypeScript 6 turns
  `esModuleInterop` on by default, and `obsidian.d.ts` declares `moment` through
  `import * as Moment from 'moment'`, so `moment(...)` loses its call signature
  (TS2349) and the scanner reports `@typescript-eslint/no-unsafe-*` in `src/sync-engine.ts`.
  Setting the option to `false` restores the TypeScript 5 behavior. TypeScript 6 marks it as
  deprecated (TS5107), and TypeScript 7 removes it. When the scanner or this project moves to
  TypeScript 7, the fix has to move to code or to Obsidian's typings.
- **Settings tab still uses `display()`.** `getSettingDefinitions()` exists since Obsidian
  1.13.0, and `minAppVersion` is 1.5.0. The scanner's eslint-plugin-obsidianmd 0.4.1 reports
  14 `display` deprecations and one `prefer-setting-definitions` warning. eslint-plugin-obsidianmd
  0.5.1 (this project's dev dependency) allows `display()` below 1.13 through
  `noDeprecatedOptions(manifest)`. Migrating means declaring 35 settings while keeping
  `display()` for older apps, or raising `minAppVersion` to 1.13.0.
- **README "unfilled placeholder text" warning has no public source.** The public check
  `README_PLACEHOLDER_REGEX` (`/\b(?:TODO|FIXME)\b|<your|yourusername|plugin-name|lorem ipsum/i`
  in `src/repo-checks.ts`) does not match this README at `86186e2`, `72f685c`, or `a79e92f`.
  The portal still reports it. The only template-like content left is `<details>`/`<summary>`
  and the documented `<!-- todoist-id -->` / `<!-- todoist-due -->` markers, which are needed.
- **Scanner cache conflict when reproducing locally.** eslint-plugin-obsidianmd 0.5.1 and 0.4.1
  share `node_modules/.cache/eslint-plugin-obsidianmd/since-map.json`. Running `npm run lint`
  (0.5.1) and then the 0.4.1 scanner in the same checkout crashes the scanner in
  `no-unsupported-api` ("Invalid version. Must be a string"). Delete that cache directory before
  running the scanner locally. The public workflow runs either the user lint or the scanner
  lint, not both.

## Testing not yet run

- **Real Todoist API.** The plugin authenticates only with a Todoist API token. The dedicated
  test vault has no token, so the completed-only blocks were verified without a token (live) and
  with in-memory mocked data, not against the real API. Real read-only checks need a token
  entered in the test vault's plugin settings; checks that complete or reopen tasks need explicit
  approval and a test project.
