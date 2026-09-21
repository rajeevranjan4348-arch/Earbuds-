/**
 * Android MCP Tools (Repository 17: androir-mcp + Repository 14: Ghost-in-the-Droid)
 * Standardized Model Context Protocol schemas for Android device automation.
 */

export const androidMcpToolDefinitions = [
  {
    name: 'android_launch_app',
    description:
      'Launches an installed Android application by name or package identifier with verification.',
    parameters: {
      type: 'OBJECT',
      properties: {
        appName: {
          type: 'STRING',
          description: 'Name of the app (e.g., WhatsApp, YouTube, Settings, Chrome).'
        },
        packageName: { type: 'STRING', description: 'Optional explicit Android package name.' }
      },
      required: ['appName']
    }
  },
  {
    name: 'android_tap',
    description:
      'Taps a coordinate (x, y) or an element identified by text or resource ID on the active Android screen.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'INTEGER', description: 'X pixel coordinate on screen.' },
        y: { type: 'INTEGER', description: 'Y pixel coordinate on screen.' },
        elementText: { type: 'STRING', description: 'Optional text of the UI element to tap.' }
      }
    }
  },
  {
    name: 'android_type',
    description: 'Types text into the currently focused Android input field.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Text string to type into the active input element.' },
        pressEnter: {
          type: 'BOOLEAN',
          description: 'Whether to send an Enter key event after typing.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'android_swipe',
    description:
      'Performs a touch swipe or scroll gesture in a specified direction (up, down, left, right).',
    parameters: {
      type: 'OBJECT',
      properties: {
        direction: {
          type: 'STRING',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Swipe direction.'
        },
        distance: { type: 'INTEGER', description: 'Swipe distance in pixels (default: 500).' }
      },
      required: ['direction']
    }
  },
  {
    name: 'android_press_key',
    description:
      'Simulates an Android hardware key press (BACK, HOME, RECENTS, VOLUME_UP, VOLUME_DOWN).',
    parameters: {
      type: 'OBJECT',
      properties: {
        key: {
          type: 'STRING',
          enum: ['BACK', 'HOME', 'RECENTS', 'VOLUME_UP', 'VOLUME_DOWN'],
          description: 'Key identifier.'
        }
      },
      required: ['key']
    }
  },
  {
    name: 'android_get_screen',
    description:
      'Reads the active Android screen hierarchy, visible UI elements, and interactive targets.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filterClickableOnly: {
          type: 'BOOLEAN',
          description: 'Only return clickable and focusable elements.'
        }
      }
    }
  }
]
