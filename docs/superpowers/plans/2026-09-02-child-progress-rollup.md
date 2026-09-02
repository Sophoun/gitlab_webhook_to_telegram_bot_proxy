# Child Issue Progress Rollup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a parent (master) issue has linked child issues, aggregate child `/dev` and `/test` progress into a "Work Progress" summary card on the parent's detail view.

**Architecture:** UI-only change. The `issue_progress` table already stores per-issue progress. The review API already fetches progress for linked child issues via `progressByKey`. The IssueDetailView already shows individual child progress. We add an aggregate summary card.

**Tech Stack:** React, shadcn/ui (Card, Progress, Badge), lucide-react icons

**Spec:** No separate spec — this is a UI enhancement to the existing linked issues feature.

## Global Constraints

- No schema changes — `issue_progress` table already has what we need
- No API changes — review API already returns `devProgress`/`qaProgress` for linked issues
- Follow existing patterns: Card → CardHeader → CardContent, Progress bars, Badge variants
- Use existing icons: `Hammer` (dev), `FlaskConical` (QA), `Link2` (linked)

---

### Task 1: Add aggregate Work Progress card for linked children

**Files:**
- Modify: `app/components/dashboard/IssueDetailView.tsx`

**Interfaces:**
- Consumes: `issue.linkedIssues` (array of `LinkedIssueInfo` with `devProgress`, `qaProgress`, `state`)
- Produces: New "Work Progress" aggregate card rendered above the "Linked Issues" card

- [ ] **Step 1: Add aggregate progress computation**

After the existing `linkedRollupLabel` computation (line ~106), add:

```tsx
// Aggregate progress across linked child issues
const linkedDevValues = issue.linkedIssues
  .map((c) => c.devProgress)
  .filter((v): v is number => v !== null);
const linkedQaValues = issue.linkedIssues
  .map((c) => c.qaProgress)
  .filter((v): v is number => v !== null);
const linkedAvgDev = linkedDevValues.length > 0
  ? Math.round(linkedDevValues.reduce((a, b) => a + b, 0) / linkedDevValues.length)
  : null;
const linkedAvgQa = linkedQaValues.length > 0
  ? Math.round(linkedQaValues.reduce((a, b) => a + b, 0) / linkedQaValues.length)
  : null;
const linkedDevComplete = linkedDevValues.filter((v) => v === 100).length;
const linkedQaComplete = linkedQaValues.filter((v) => v === 100).length;
const linkedOpenCount = issue.linkedIssues.filter((c) => c.state !== "closed").length;
```

- [ ] **Step 2: Add aggregate Work Progress card**

Insert a new card BEFORE the existing "Linked Issues" card (before line ~325). This card shows when there are linked issues with progress data:

```tsx
{/* Aggregate work progress from linked child issues */}
{issue.linkedIssues.length > 0 && (linkedAvgDev !== null || linkedAvgQa !== null) && (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        <TrendingUp className="h-4 w-4" />
        Work Progress
      </CardTitle>
      <CardDescription>
        Aggregate progress across {issue.linkedIssues.length} linked child issue{issue.linkedIssues.length !== 1 ? "s" : ""}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {linkedAvgDev !== null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Hammer className="h-3.5 w-3.5 text-blue-500" />
              Development
            </span>
            <span className="text-sm text-muted-foreground">
              {linkedDevComplete}/{linkedDevValues.length} complete · avg {linkedAvgDev}%
            </span>
          </div>
          <Progress
            value={linkedAvgDev}
            className={`h-2 ${linkedAvgDev === 100 ? "[&>div]:bg-green-600" : ""}`}
          />
        </div>
      )}
      {linkedAvgQa !== null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <FlaskConical className="h-3.5 w-3.5 text-orange-500" />
              QA / Testing
            </span>
            <span className="text-sm text-muted-foreground">
              {linkedQaComplete}/{linkedQaValues.length} complete · avg {linkedAvgQa}%
            </span>
          </div>
          <Progress
            value={linkedAvgQa}
            className={`h-2 ${linkedAvgQa === 100 ? "[&>div]:bg-green-600" : ""}`}
          />
        </div>
      )}
      {linkedOpenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {linkedOpenCount} child issue{linkedOpenCount !== 1 ? "s" : ""} still open
        </p>
      )}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build && npm run test:run`

Expected: Build passes, 173 tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/components/dashboard/IssueDetailView.tsx
git commit -m "feat: add aggregate work progress card for linked child issues"
```

---

### Task 2: Enhance linked issues list with per-child progress bars

**Files:**
- Modify: `app/components/dashboard/IssueDetailView.tsx`

**Interfaces:**
- Consumes: `issue.linkedIssues` (same as Task 1)
- Produces: Visual progress bars next to each linked child issue (replacing plain text percentages)

- [ ] **Step 1: Replace text percentages with mini progress bars in linked issues list**

In the linked issues map (around line ~363-376), replace the text-only progress display with inline progress bars:

```tsx
<div className="flex items-center gap-3 shrink-0">
  {child.devProgress !== null && (
    <div className="flex items-center gap-1.5">
      <Hammer className="h-3 w-3 text-blue-500 shrink-0" />
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${child.devProgress === 100 ? "bg-green-600" : "bg-blue-500"}`}
          style={{ width: `${child.devProgress}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-7 text-right">{child.devProgress}%</span>
    </div>
  )}
  {child.qaProgress !== null && (
    <div className="flex items-center gap-1.5">
      <FlaskConical className="h-3 w-3 text-orange-500 shrink-0" />
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${child.qaProgress === 100 ? "bg-green-600" : "bg-orange-500"}`}
          style={{ width: `${child.qaProgress}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-7 text-right">{child.qaProgress}%</span>
    </div>
  )}
  {child.devProgress === null && child.qaProgress === null && (
    <span className="text-xs text-muted-foreground">No progress set</span>
  )}
</div>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build && npm run test:run`

Expected: Build passes, 173 tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/components/dashboard/IssueDetailView.tsx
git commit -m "feat: add mini progress bars to linked child issues list"
```
