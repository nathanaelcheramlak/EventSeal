# Commit Plan

This plan covers the current uncommitted web UI refresh and responsive layout fixes.

## Current Working Tree

Expected changed files:

- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/QrScanner.tsx`
- `apps/web/src/styles.css`
- `Commit-Plan.md`

Check before staging:

```bash
git -c safe.directory=E:/Temp/prom-event status --short
```

## Commit 1: Improve Web Console Responsiveness

Message:

```text
fix(web): improve console responsiveness
```

Purpose:

- Rework the organizer console into a sidebar plus workspace layout with a compact mobile dock.
- Add responsive wrapping and `min-width: 0` safeguards so panels, headers, buttons, tables, and badges do not overflow.
- Add missing scanner, filter, action-row, and mobile table styles.
- Improve the pass generator, verification, records, and audit views at mobile and tablet widths.
- Update web metadata and font loading to match the refreshed console UI.

Stage implementation only:

```bash
git add -- apps/web/index.html apps/web/src/App.tsx apps/web/src/QrScanner.tsx apps/web/src/styles.css
```

Stage the commit plan too:

```bash
git add -- Commit-Plan.md
```

Or stage everything for this commit in one command:

```bash
git add -- apps/web/index.html apps/web/src/App.tsx apps/web/src/QrScanner.tsx apps/web/src/styles.css Commit-Plan.md
```

Verify:

```bash
pnpm --filter @prom-event/web build
```

Commit:

```bash
git commit -m "fix(web): improve console responsiveness"
```

## Final Check

```bash
git -c safe.directory=E:/Temp/prom-event status --short
```

Do not stage `.env`, `node_modules`, `apps/web/dist`, `output`, logs, or generated TypeScript build info files.
