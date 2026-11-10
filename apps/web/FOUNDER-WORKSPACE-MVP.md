# CIAS Founder Workspace MVP

This is the fast, local-first prototype for internal company demonstrations.

## Start

From the repository root:

\`\`\`bash
pnpm install
pnpm --filter @cias/web dev
\`\`\`

Open the Vite URL shown in the terminal.

## What works in this prototype

- Organization World: draggable department zones and employee avatars.
- Employee profiles: add/edit people, department, skills and interview notes.
- Task Command: submit work for approval, correct/reject/approve proposed work, set owner, requester, deadline, priority and estimate.
- Execution: start/pause/complete task timer; one active timer at a time.
- Performance: current workload, completion and time summaries.
- Browser persistence: employees, tasks and map positions are saved in localStorage.

## Prototype boundaries

- The included team and tasks are fictional sample data. Replace them with approved company information before a real demonstration.
- This is a single-browser founder workspace, not a multi-device employee portal.
- There is no employee login, remote synchronization or server-side storage in this MVP.
- Do not enter passwords, credentials, customer secrets, financial account data or other sensitive information.
- Clearing browser site data removes the locally saved prototype records. Use **Reset demo** to restore the sample workspace.
- Time tracking is a basic elapsed timer, not an audited timesheet.
- Performance figures are descriptive snapshots, not validated employee performance scores.

The purpose of this build is to validate the team's workflow and the interaction design before investing in shared backend functionality.
