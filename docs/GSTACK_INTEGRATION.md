# IRIS x gstack Integration Documentation

## 1. Overview
The engineering, agent, workflow, automation, tooling, and system-level capabilities from **garrytan/gstack** have been adapted and integrated directly into the **IRIS AI Assistant** architecture.

All capabilities run underneath the existing IRIS user interface, preserving 100% of the UI layout, navigation, voice pipeline, 3D neural orb, and themes.

---

## 2. Imported & Adapted Architecture

```
IRIS CORE
├── Reasoning / Planning
├── Memory & Blackboard State
├── Unified Tool Registry
├── Intent & Goal Classifier
├── Permission Manager & Staging Guard
├── Verification Engine
└── gstack Integration Layer (src/server/gstack/)
    ├── redactEngine.ts        # 3-tier linear-time secret & PII scanner
    ├── permissionManager.ts   # Staging guard & human-in-the-loop gate
    ├── verifyGate.ts          # Automated typecheck/lint/test/build runner
    ├── codeIntelligence.ts   # Repository scanner, AST/symbols, safe edits
    ├── specialistReviews.ts   # CEO, Eng, Design, DevEx reviews + Autoplan
    ├── investigateEngine.ts   # Systematic failure root-cause analysis
    ├── shipEngine.ts          # Pre-flight commit & release readiness
    ├── decisionLedger.ts      # Event-sourced architectural decision records
    └── gstackRouter.ts        # Centralized skill routing & telemetry
```

---

## 3. Specialist Skills & Workflows

### 3.1. Autoplan & Multi-Perspective Reviews
- **CEO Review (`planCeoReview`)**: Evaluates user problem definition, 10-star UX vision, scope discipline, and product ambition.
- **Engineering Review (`planEngReview`)**: Systems architecture, data boundaries, concurrency, failure modes, error fallback, and performance.
- **Design Review (`planDesignReview`)**: Component structure, visual hierarchy, responsive layout, anti-slop principles, micro-interactions.
- **DevEx Review (`planDevexReview`)**: Tooling velocity, feedback loops, static typing rigor, and test runtimes.
- **Autoplan Gauntlet (`runAutoplan`)**: Chains all 4 reviews sequentially and returns a synthesized locked execution plan with composite confidence score.

### 3.2. Investigation & Root Cause Debugging (`investigateEngine`)
- Automatically decomposes failures into 5 distinct layers:
  1. `environment` (sockets, ports, permissions)
  2. `dependency` (missing modules, version mismatches)
  3. `build_syntax` (TypeScript TSxxxx compiler errors, syntax errors)
  4. `runtime` (unhandled exceptions, null pointer references)
  5. `logic_invariant` (assertion failures)
- Formulates minimal, non-destructive repair hypotheses verified through `verifyGate`.

### 3.3. Verification Gate (`verifyGate`)
- Auto-discovers declared verification commands in `package.json` (`tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`).
- Confines processes with execution timeout caps.
- Parses compiler outputs for exact file and line error diagnostics.

### 3.4. Redaction Engine (`redactEngine`)
- ReDoS-safe linear-time patterns covering:
  - **HIGH Tier**: AWS keys, GitHub PAT/OAuth tokens, Private Keys, Database connection strings with passwords, npm tokens, OpenAI/Anthropic keys.
  - **MEDIUM Tier**: Google AIza keys, Stripe keys, JWT tokens, PII emails, SSNs.
- Intercepts outbound logs, diffs, and chat responses to ensure zero credential leakage.

### 3.5. Shipping & Release Safety Gate (`shipEngine`)
- Pre-flight commit inspection:
  - Working tree cleanliness.
  - Verification gate pass.
  - Secret scan over `git diff`.
  - Recommends Conventional Commit messages (`feat(module): ...`, `fix(core): ...`).
  - Guards against accidental commits or remote pushes.

### 3.6. Engineering Decision Ledger (`decisionLedger`)
- Event-sourced institutional memory for architectural decision records (ADRs).
- Stores `decide`, `supersede`, and `redact` events with rationale and alternatives considered.
- Backed by persistent `.iris-brain-memory.json`.

---

## 4. Unified Tool Registry Endpoints

The following tools are registered in IRIS's `ToolRegistry` and available to AI planners, agents, and natural language chat/voice:

| Tool Name | Description | Permission Level |
|---|---|---|
| `gstack_analyze_repo` | Full repository structure and dependency inspection | standard |
| `gstack_autoplan` | 4-way specialist review gauntlet (CEO, Eng, Design, DevEx) | standard |
| `gstack_specialist_review` | Targeted specialist review for architecture or UX | standard |
| `gstack_investigate_debug` | Systematic build & runtime error root cause diagnosis | standard |
| `gstack_verify_gate` | Discovers & runs declared typecheck, lint, and test scripts | standard |
| `gstack_cso_security_audit` | Scans files and diffs for leaked secrets & credentials | standard |
| `gstack_ship_check` | Validates release readiness and uncommitted diffs | standard |
| `gstack_decision_log` | Records and retrieves institutional ADRs | standard |

---

## 5. Voice & Chat Usage Examples

### Natural Language & Voice Triggers:
1. **"Analyze this repository"**
   → Invokes `gstack_analyze_repo`, scans project directories, package managers, and primary languages.
2. **"Review our architecture"** / **"Eng review"**
   → Invokes `gstack_specialist_review` with subRole `eng`.
3. **"Think bigger on this feature"** / **"CEO review"**
   → Invokes `gstack_specialist_review` with subRole `ceo`.
4. **"Run the autoplan gauntlet"**
   → Invokes `gstack_autoplan`, running CEO, Eng, Design, and DevEx reviews with confidence scoring.
5. **"Why is the build failing?"** / **"Investigate this error"**
   → Invokes `gstack_investigate_debug`, isolates the failure layer, and recommends verifiable fixes.
6. **"Run verification"** / **"Run the tests"**
   → Invokes `gstack_verify_gate`, running `npx tsc --noEmit` and declared test scripts.
7. **"Scan for secrets"** / **"Check security"**
   → Invokes `gstack_cso_security_audit` using the Redaction Engine.
8. **"Prepare commit"** / **"Are we ready to ship?"**
   → Invokes `gstack_ship_check` with git tree audit and secret checks.
