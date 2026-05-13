# Release and Tag Plan

Sync Todoist has an independent release line. Upstream Syncist tags and releases are intentionally not reused in this repository.

## Rules

- Use semver versions in `x.y.z` form.
- Git tags must exactly match `manifest.json` `version`.
- Do not prefix release tags with `v`.
- Keep `manifest.json` and `package.json` versions identical.
- Every public release must include `main.js`, `manifest.json`, and `styles.css` as GitHub release assets.
- Build before tagging so the committed `main.js` matches the source.

## Release Line

- `0.1.0`: first Sync Todoist test release after local manual QA.
- `0.2.0`: follow-up test release for fixes found during real Obsidian/Todoist use.
- `1.0.0`: first community-submission candidate after the test release line is stable.

## Release Checklist

1. Confirm the working tree is clean except intended release edits.
2. Update `manifest.json` and `package.json` to the same version.
3. Run:
   ```bash
   npm run lint
   npm run build
   npx tsc --noEmit
   ```
4. Run the manual test spec in `test/TEST_SPEC_v2.0.0.md`.
5. Commit the version bump and rebuilt `main.js`.
6. Create a tag matching the version exactly:
   ```bash
   git tag 0.1.0
   git push origin main 0.1.0
   ```
7. Create a GitHub release for that tag with `main.js`, `manifest.json`, and `styles.css`.

## Notes

- The repository name remains `obsidian-sync-todoist`.
- The Obsidian plugin id is `sync-todoist`.
- The Obsidian plugin display name is `Sync Todoist`.
