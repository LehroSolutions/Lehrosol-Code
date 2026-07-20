# Code Review Report

**Project:** project-portal
**Date:** 2026-04-21
**Reviewer:** LehroCode Reviewer Agent

## Gates Passed
- Security
- Error Handling
- Testing

## Gates With Notes
- Architecture - the menu sidebar and menu editor disagree on hierarchy handling
- Edge Cases - the desktop collapse control does not reclaim content width
- Code Quality - a few props/imports are still dead or misleading

## Issues
| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|
| Warning | [src/app/(admin)/layout.tsx](src/app/(admin)/layout.tsx#L33) | 33 | The main content always reserves `md:pl-60`, even though the sidebar can collapse to `64px` in [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx#L41). Collapsing the sidebar leaves a large empty gutter and makes the control look broken. | Lift the collapsed state into the layout and switch the content padding between the expanded and collapsed widths, or remove the collapse control. |
| Warning | [convex/menus.ts](convex/menus.ts#L13-L22), [src/components/layout/Sidebar.tsx](src/components/layout/Sidebar.tsx#L77-L86), [src/app/(admin)/menus/page.tsx](src/app/(admin)/menus/page.tsx#L34-L168) | 13-22, 77-86, 34-168 | The menu editor allows pathless or nested menus, and `getTree` already returns child menus, but the sidebar only maps the root list and falls back to `#` for missing paths. Nested menus never appear in navigation, and pathless parents become broken links instead of group headers. | Render the menu tree recursively in the sidebar and treat pathless parents as non-clickable labels, or require a path at creation time. |

## Suggestions
1. [src/components/shared/DataTable.tsx](src/components/shared/DataTable.tsx#L57) exposes a `searchKey` prop that is not actually used. Either wire the filter to that key or remove the prop so the API matches the implementation.
2. [src/components/layout/Header.tsx](src/components/layout/Header.tsx#L3) still imports `useConvexAuth` without using it.

## Verdict
⚠ FOLLOW-UP REQUIRED - the app is functioning, but the sidebar/layout mismatch and menu hierarchy handling should be tightened before calling the workflow complete.