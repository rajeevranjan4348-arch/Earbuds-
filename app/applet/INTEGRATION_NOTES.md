# Iris integration notes
1. Import `CoderMode` from `./CoderMode`.
2. Render `<CoderMode />` inside Iris's existing route/page/container.
3. Keep Iris's existing UI/layout; use the component as the feature body only.
4. Ensure Iris already has React + Tailwind CSS configured.
5. Install:
- @google/genai
- @monaco-editor/react
- lucide-react
- react-markdown
- react-resizable-panels
6. Preserve Iris's existing authentication and backend. Do not copy Omni authentication or app shell.
7. Replace the Gemini implementation with Iris's existing AI provider if Iris already has one.
