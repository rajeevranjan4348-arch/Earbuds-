/**
 * Diagram Generation Engine (Repository 05: cathrynlavery/diagram-design)
 * Produces structured Mermaid.js schemas, ASCII architectural diagrams,
 * and technical workflows without importing any external UI or styles.
 */

export type DiagramType = 'flowchart' | 'sequence' | 'architecture' | 'state' | 'class'

export interface DiagramResult {
  type: DiagramType
  title: string
  mermaidCode: string
  asciiDiagram?: string
  description: string
}

export class DiagramDesignEngine {
  /**
   * Generates a diagram specification based on user prompt and requested type
   */
  public generateDiagram(
    title: string,
    type: DiagramType = 'flowchart',
    steps: { from: string; to: string; label?: string }[] = []
  ): DiagramResult {
    let mermaidCode = ''
    let asciiDiagram = ''

    switch (type) {
      case 'sequence': {
        mermaidCode = `sequenceDiagram\n  autonumber\n`
        for (const step of steps) {
          const lbl = step.label ? `: ${step.label}` : ': invoke'
          mermaidCode += `  ${step.from}->>${step.to}${lbl}\n`
        }
        break
      }

      case 'architecture': {
        mermaidCode = `graph TD\n`
        mermaidCode += `  subgraph Client [Client Layer]\n    UI[User Interface]\n  end\n`
        mermaidCode += `  subgraph Core [AI Core Orchestrator]\n    Agent[Agent Router]\n    Mem[(Memory Engine)]\n  end\n`
        mermaidCode += `  subgraph Tools [Tool Registry]\n    Android[Android Controller]\n    Search[Web Search]\n    FLUX[Image Engine]\n  end\n`
        mermaidCode += `  UI --> Agent\n  Agent <--> Mem\n  Agent --> Android\n  Agent --> Search\n  Agent --> FLUX\n`

        asciiDiagram = `
┌─────────────────────────┐
│     User Interface      │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐     ┌────────────────┐
│   Agent Orchestrator    │◄───►│ Unified Memory │
└────────────┬────────────┘     └────────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
┌───────┐┌───────┐┌───────┐
│Android││Search ││ FLUX  │
└───────┘└───────┘└───────┘`
        break
      }

      case 'state': {
        mermaidCode = `stateDiagram-v2\n  [*] --> Idle\n  Idle --> Analyzing: User Command\n  Analyzing --> Executing: Validated Action\n  Executing --> Verifying: Action Executed\n  Verifying --> Complete: Success Verified\n  Verifying --> Recovering: Mismatch Detected\n  Recovering --> Idle\n  Complete --> [*]\n`
        break
      }

      case 'flowchart':
      default: {
        mermaidCode = `graph TD\n`
        if (steps.length > 0) {
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i]
            const lbl = step.label ? `|${step.label}| ` : ''
            mermaidCode += `  ${step.from} --> ${lbl}${step.to}\n`
          }
        } else {
          mermaidCode += `  Start([Start]) --> Input[Receive Intent]\n  Input --> Validate{Safe?}\n  Validate -->|Yes| Execute[Run Action]\n  Validate -->|No| Redact[Sanitize & Recover]\n  Execute --> End([Success])\n  Redact --> End\n`
        }
        break
      }
    }

    return {
      type,
      title,
      mermaidCode,
      asciiDiagram: asciiDiagram || undefined,
      description: `Structured technical diagram for "${title}" (${type}).`
    }
  }
}

export const diagramDesign = new DiagramDesignEngine()
