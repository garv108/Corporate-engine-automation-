# CIAS Organization Twin

The Organization Twin is the interactive workforce visualization module for CIAS.

## Current prototype

- React Flow canvas with draggable employee, department, organization and task nodes.
- Click an employee, department, task or organization node to open its inspector.
- Animated reporting, ownership and task-dependency edges.
- Search and department filters; task layer can be toggled.
- Animated CSS character fallback. The employee avatar component accepts a Rive asset path through \`riveSrc\`; place approved \`.riv\` files in \`apps/web/public/rive/\` before enabling that field.
- Clearly labelled fictional demo data. No API writes or employee mutations occur from canvas interactions.

## Architecture boundaries

- The canvas is a projection, not the source of truth.
- Node positions are local UI state in this prototype. They do not change reporting relationships.
- Production integration must read tenant-scoped departments, employees, manager links, skills and tasks from authenticated CIAS APIs.
- Task dependency edges require a persisted dependency contract; do not infer dependencies from visual proximity.
- Dragging nodes must never grant permissions or change reporting lines.
- Any future layout persistence must be tenant-scoped, permission-checked and audited.

## Run

From the repository root:

\`\`\`bash
pnpm install
pnpm --filter @cias/web dev
\`\`\`

Open the local Vite URL. This branch adds \`@xyflow/react\` and \`@rive-app/react-canvas\` to the web app dependencies.
