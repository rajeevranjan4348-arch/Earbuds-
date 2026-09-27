# Iris AI Coder IDE — extracted from Omni-chat
This package contains the **AI Coder IDE feature only**, extracted from the supplied Omni-chat ZIP.
## Included
- Monaco code editor
- AI coding assistant/chat
- Multi-project persistence via localStorage
- File explorer and file editing
- Language selector
- Editor themes
- Live HTML/CSS/JS preview
- Simulated terminal panel
- Git-style commit/history UI
- Code completion using Gemini
- Image-generation modal used by the original CoderMode
- Resizable IDE panels
## Main entry
`src/renderer/src/CoderMode.tsx`
## Integration
Copy `src/CoderMode.tsx`, `src/contexts/ThemeContext.tsx`, and `src/services/gemini.ts` into Iris, then install the dependencies from `package.json`.
The component currently uses the original Omni localStorage keys (`omnichat_coder_*`). Change these to Iris-specific keys if you want separate storage.
The original Gemini service reads `process.env.GEMINI_API_KEY`; adapt this to Iris's existing secure backend/API layer rather than exposing a production API key in browser code.
No Omni-chat `App.tsx`, sidebar, chat mode, dashboard, Astra modules, or unrelated UI files are included.
