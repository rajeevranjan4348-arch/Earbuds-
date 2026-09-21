/**
 * Android Accessibility Service Bridge & Screen Understanding Engine
 * Ported and synthesized from:
 * - OpenDroid (com.opendroid.ai.core.service.OpenDroidAccessibilityService)
 * - Android Agent (com.adev0x.agentphone.services.AccessibilityActionService)
 *
 * Provides:
 * 1. UI Node Tree Traversal & Inspection (bounds, viewId, clickable, text)
 * 2. Gesture Dispatching (tap, swipe, scroll, typeText, back, home, recents)
 * 3. Screen State Capture & Change Detection (SIGNIFICANT, MINOR, NONE)
 * 4. Resilient Error & Permission Handling (ACCESSIBILITY_PERMISSION_MISSING status)
 */

import {
  AccessibilityNode,
  AccessibilityServiceStatus,
  ScreenChangeComparison,
  ScreenChangeLevel,
  ScreenState
} from './types'
import { ActionRiskPolicy } from './actionRisk'

export class AccessibilityService {
  private static instance: AccessibilityService
  private currentPackage = 'com.google.android.apps.nexuslauncher'
  private currentActivity = 'com.google.android.apps.nexuslauncher.NexusLauncherActivity'
  private currentAppName = 'Home Screen'
  private screenWidth = 1080
  private screenHeight = 2400
  private isConnected = true
  private accessibilityPermissionGranted = true
  private lastScreenHash = ''
  private dynamicAppTrees: Map<string, AccessibilityNode> = new Map()

  private constructor() {
    this.initDefaultMockTrees()
  }

  public static getInstance(): AccessibilityService {
    if (!AccessibilityService.instance) {
      AccessibilityService.instance = new AccessibilityService()
    }
    return AccessibilityService.instance
  }

  /**
   * Checks if Android Accessibility Service is active and permitted.
   * If permission is missing, returns status instead of throwing/crashing.
   */
  public async checkPermission(): Promise<{
    granted: boolean
    status: AccessibilityServiceStatus
    message: string
  }> {
    // Check if native Android bridge exists
    if (typeof window !== 'undefined' && (window as any).Android?.isAccessibilityServiceEnabled) {
      try {
        const nativeEnabled = (window as any).Android.isAccessibilityServiceEnabled()
        this.accessibilityPermissionGranted = Boolean(nativeEnabled)
      } catch (e) {
        console.warn('[AccessibilityService] Error checking native a11y service:', e)
      }
    }

    if (!this.accessibilityPermissionGranted) {
      return {
        granted: false,
        status: 'ACCESSIBILITY_PERMISSION_MISSING',
        message:
          'Accessibility permission is not granted. Please enable IRIS Accessibility Service in Android Settings > Accessibility.'
      }
    }

    return {
      granted: true,
      status: 'READY',
      message: 'Android Accessibility Service is online and responsive.'
    }
  }

  public setAccessibilityPermission(granted: boolean): void {
    this.accessibilityPermissionGranted = granted
  }

  /**
   * Sets the active foreground package and activity.
   */
  public setForegroundApp(packageName: string, appName?: string, activityName?: string): void {
    this.currentPackage = packageName
    this.currentAppName = appName || this.guessAppName(packageName)
    this.currentActivity = activityName || `${packageName}.MainActivity`
  }

  public getCurrentPackage(): string {
    return this.currentPackage
  }

  public getCurrentAppName(): string {
    return this.currentAppName
  }

  /**
   * Traverses node tree to extract all visible text.
   */
  public extractAllVisibleText(node: AccessibilityNode | null): string[] {
    if (!node) return []
    const texts: string[] = []

    const traverse = (n: AccessibilityNode) => {
      if (n.text && n.text.trim()) {
        texts.push(n.text.trim())
      } else if (n.contentDescription && n.contentDescription.trim()) {
        texts.push(n.contentDescription.trim())
      }
      for (const child of n.children || []) {
        traverse(child)
      }
    }

    traverse(node)
    return texts
  }

  /**
   * Traverses node tree to extract all interactive (clickable, editable, scrollable) elements.
   */
  public extractInteractiveElements(node: AccessibilityNode | null): AccessibilityNode[] {
    if (!node) return []
    const elements: AccessibilityNode[] = []

    const traverse = (n: AccessibilityNode) => {
      if (n.isClickable || n.isEditable || n.isScrollable) {
        elements.push(n)
      }
      for (const child of n.children || []) {
        traverse(child)
      }
    }

    traverse(node)
    return elements
  }

  /**
   * Captures the full current screen state including UI hierarchy, visible text,
   * interactive elements, and a screen layout hash.
   */
  public async getScreenState(): Promise<ScreenState> {
    const perm = await this.checkPermission()
    if (!perm.granted) {
      return {
        packageName: this.currentPackage,
        activityName: this.currentActivity,
        appName: this.currentAppName,
        screenWidth: this.screenWidth,
        screenHeight: this.screenHeight,
        allVisibleText: [],
        interactiveElements: [],
        rootNode: null,
        timestamp: Date.now(),
        screenHash: 'hash_perm_missing',
        accessibilityReady: false,
        status: 'ACCESSIBILITY_PERMISSION_MISSING'
      }
    }

    // Check if native Android bridge provides real live node info
    let rootNode: AccessibilityNode | null = null
    if (typeof window !== 'undefined' && (window as any).Android?.getAccessibilityRootNodeJson) {
      try {
        const rawJson = (window as any).Android.getAccessibilityRootNodeJson()
        if (rawJson) {
          rootNode = JSON.parse(rawJson)
        }
      } catch (e) {
        console.warn('[AccessibilityService] Failed to read native accessibility nodes:', e)
      }
    }

    // Fallback to active app dynamic tree
    if (!rootNode) {
      rootNode = this.getOrBuildAppNodeTree(this.currentPackage)
    }

    const allVisibleText = this.extractAllVisibleText(rootNode)
    const interactiveElements = this.extractInteractiveElements(rootNode)
    const screenHash = this.computeScreenHash(
      this.currentPackage,
      allVisibleText,
      interactiveElements
    )

    this.lastScreenHash = screenHash

    return {
      packageName: this.currentPackage,
      activityName: this.currentActivity,
      appName: this.currentAppName,
      screenWidth: this.screenWidth,
      screenHeight: this.screenHeight,
      allVisibleText,
      interactiveElements,
      rootNode,
      timestamp: Date.now(),
      screenHash,
      accessibilityReady: true,
      status: 'READY'
    }
  }

  /**
   * Finds an element in the current UI hierarchy by text, partial text, or regex match.
   */
  public async findElement(query: string): Promise<AccessibilityNode | null> {
    const state = await this.getScreenState()
    if (!state.rootNode) return null

    const cleanQuery = query.toLowerCase().trim()
    let found: AccessibilityNode | null = null

    const search = (node: AccessibilityNode) => {
      if (found) return

      const text = (node.text || '').toLowerCase()
      const desc = (node.contentDescription || '').toLowerCase()
      const resId = (node.viewIdResourceName || '').toLowerCase()

      if (
        text === cleanQuery ||
        desc === cleanQuery ||
        text.includes(cleanQuery) ||
        desc.includes(cleanQuery) ||
        resId.includes(cleanQuery)
      ) {
        found = node
        return
      }

      for (const child of node.children || []) {
        search(child)
      }
    }

    search(state.rootNode)
    return found
  }

  /**
   * Finds a clickable element by label or description.
   */
  public async findClickableElement(description: string): Promise<AccessibilityNode | null> {
    const state = await this.getScreenState()
    const cleanDesc = description.toLowerCase().trim()

    // 1. Search directly in interactive elements
    for (const el of state.interactiveElements) {
      const text = (el.text || '').toLowerCase()
      const desc = (el.contentDescription || '').toLowerCase()
      const resId = (el.viewIdResourceName || '').toLowerCase()

      if (
        text === cleanDesc ||
        desc === cleanDesc ||
        text.includes(cleanDesc) ||
        desc.includes(cleanDesc) ||
        resId.includes(cleanDesc)
      ) {
        return el
      }
    }

    // 2. Fallback to any node match
    return this.findElement(description)
  }

  /**
   * Dispatches a tap at screen coordinates (x, y).
   */
  public async dispatchTap(
    x: number,
    y: number
  ): Promise<{ success: boolean; tappedNode?: AccessibilityNode }> {
    console.log(`[AccessibilityService] Tap gesture dispatched at (${x}, ${y})`)

    // If native Android bridge is available, use dispatchGesture
    if (typeof window !== 'undefined' && (window as any).Android?.dispatchTap) {
      try {
        const result = (window as any).Android.dispatchTap(x, y)
        return { success: Boolean(result) }
      } catch (e) {
        console.warn('[AccessibilityService] Native tap failed:', e)
      }
    }

    // Find if a node was hit at these coordinates
    const state = await this.getScreenState()
    let hitNode: AccessibilityNode | undefined

    if (state.rootNode) {
      const findHit = (node: AccessibilityNode) => {
        if (
          x >= node.bounds.left &&
          x <= node.bounds.right &&
          y >= node.bounds.top &&
          y <= node.bounds.bottom
        ) {
          if (node.isClickable || !hitNode) {
            hitNode = node
          }
        }
        for (const child of node.children || []) {
          findHit(child)
        }
      }
      findHit(state.rootNode)
    }

    if (hitNode) {
      this.handleNodeInteraction(hitNode, 'tap')
    }

    return { success: true, tappedNode: hitNode }
  }

  /**
   * Taps an element directly by node reference or selector string.
   */
  public async dispatchTapElement(
    elementOrSelector: AccessibilityNode | string
  ): Promise<{ success: boolean; tappedNode?: AccessibilityNode }> {
    let targetNode: AccessibilityNode | null = null

    if (typeof elementOrSelector === 'string') {
      targetNode = await this.findClickableElement(elementOrSelector)
      if (!targetNode) {
        targetNode = await this.findElement(elementOrSelector)
      }
    } else {
      targetNode = elementOrSelector
    }

    if (!targetNode) {
      console.warn(`[AccessibilityService] Tap failed: element not found`, elementOrSelector)
      return { success: false }
    }

    console.log(
      `[AccessibilityService] Tapping node: "${targetNode.text || targetNode.contentDescription}" at (${targetNode.bounds.centerX}, ${targetNode.bounds.centerY})`
    )

    return this.dispatchTap(targetNode.bounds.centerX, targetNode.bounds.centerY)
  }

  /**
   * Dispatches a long press gesture.
   */
  public async dispatchLongPress(
    x: number,
    y: number,
    durationMs = 1000
  ): Promise<{ success: boolean }> {
    console.log(`[AccessibilityService] Long press at (${x}, ${y}) duration ${durationMs}ms`)
    if (typeof window !== 'undefined' && (window as any).Android?.dispatchLongPress) {
      try {
        const result = (window as any).Android.dispatchLongPress(x, y, durationMs)
        return { success: Boolean(result) }
      } catch (e) {}
    }
    return { success: true }
  }

  /**
   * Types text into the currently focused or specified editable node.
   */
  public async dispatchTypeText(
    text: string,
    targetSelector?: string
  ): Promise<{ success: boolean; enteredText: string }> {
    const redacted = ActionRiskPolicy.redactSensitiveData(text)
    console.log(`[AccessibilityService] Typing text: "${redacted}"`)

    let targetNode: AccessibilityNode | null = null
    if (targetSelector) {
      targetNode = await this.findElement(targetSelector)
      if (targetNode) {
        await this.dispatchTap(targetNode.bounds.centerX, targetNode.bounds.centerY)
      }
    }

    // If native Android bridge is available, use performAction(ACTION_SET_TEXT)
    if (typeof window !== 'undefined' && (window as any).Android?.typeText) {
      try {
        const res = (window as any).Android.typeText(text)
        return { success: Boolean(res), enteredText: text }
      } catch (e) {}
    }

    // Update active app state to reflect typed search/text
    this.updateActiveAppStateForInput(text)

    return { success: true, enteredText: text }
  }

  /**
   * Clears text from the active or specified input field.
   */
  public async dispatchClearText(targetSelector?: string): Promise<{ success: boolean }> {
    console.log(`[AccessibilityService] Clearing text field`)
    if (targetSelector) {
      const node = await this.findElement(targetSelector)
      if (node) {
        await this.dispatchTap(node.bounds.centerX, node.bounds.centerY)
      }
    }

    if (typeof window !== 'undefined' && (window as any).Android?.clearText) {
      try {
        const res = (window as any).Android.clearText()
        return { success: Boolean(res) }
      } catch (e) {}
    }

    return { success: true }
  }

  /**
   * Dispatches a swipe gesture from (startX, startY) to (endX, endY).
   */
  public async dispatchSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs = 300
  ): Promise<{ success: boolean }> {
    console.log(`[AccessibilityService] Swipe from (${startX},${startY}) to (${endX},${endY})`)

    if (typeof window !== 'undefined' && (window as any).Android?.dispatchSwipe) {
      try {
        const res = (window as any).Android.dispatchSwipe(startX, startY, endX, endY, durationMs)
        return { success: Boolean(res) }
      } catch (e) {}
    }

    return { success: true }
  }

  /**
   * Performs a directional scroll (up, down, left, right).
   */
  public async dispatchScroll(
    direction: 'up' | 'down' | 'left' | 'right'
  ): Promise<{ success: boolean; direction: string }> {
    console.log(`[AccessibilityService] Scroll ${direction}`)

    const midX = Math.floor(this.screenWidth / 2)
    const startY =
      direction === 'down'
        ? Math.floor(this.screenHeight * 0.75)
        : Math.floor(this.screenHeight * 0.25)
    const endY =
      direction === 'down'
        ? Math.floor(this.screenHeight * 0.25)
        : Math.floor(this.screenHeight * 0.75)

    if (direction === 'down' || direction === 'up') {
      return this.dispatchSwipe(midX, startY, midX, endY, 350).then((r) => ({
        ...r,
        direction
      }))
    } else {
      const startX = direction === 'right' ? 800 : 200
      const endX = direction === 'right' ? 200 : 800
      const midY = Math.floor(this.screenHeight / 2)
      return this.dispatchSwipe(startX, midY, endX, midY, 350).then((r) => ({
        ...r,
        direction
      }))
    }
  }

  /**
   * Dispatches Android Global Action: BACK
   */
  public async dispatchBack(): Promise<{ success: boolean }> {
    console.log(`[AccessibilityService] Global Action: BACK`)
    if (typeof window !== 'undefined' && (window as any).Android?.pressBack) {
      try {
        const res = (window as any).Android.pressBack()
        return { success: Boolean(res) }
      } catch (e) {}
    }

    if (this.currentPackage !== 'com.google.android.apps.nexuslauncher') {
      // Return to home or previous state
      this.setForegroundApp('com.google.android.apps.nexuslauncher', 'Home Screen')
    }

    return { success: true }
  }

  /**
   * Dispatches Android Global Action: HOME
   */
  public async dispatchHome(): Promise<{ success: boolean }> {
    console.log(`[AccessibilityService] Global Action: HOME`)
    if (typeof window !== 'undefined' && (window as any).Android?.pressHome) {
      try {
        const res = (window as any).Android.pressHome()
        return { success: Boolean(res) }
      } catch (e) {}
    }

    this.setForegroundApp('com.google.android.apps.nexuslauncher', 'Home Screen')
    return { success: true }
  }

  /**
   * Dispatches Android Global Action: RECENTS
   */
  public async dispatchRecents(): Promise<{ success: boolean }> {
    console.log(`[AccessibilityService] Global Action: RECENTS`)
    if (typeof window !== 'undefined' && (window as any).Android?.pressRecents) {
      try {
        const res = (window as any).Android.pressRecents()
        return { success: Boolean(res) }
      } catch (e) {}
    }
    return { success: true }
  }

  /**
   * Performs an Enter / Submit on the virtual keyboard.
   */
  public async dispatchImeEnter(): Promise<{ success: boolean }> {
    console.log(`[AccessibilityService] IME Enter dispatched`)
    if (typeof window !== 'undefined' && (window as any).Android?.performImeEnter) {
      try {
        const res = (window as any).Android.performImeEnter()
        return { success: Boolean(res) }
      } catch (e) {}
    }
    return { success: true }
  }

  /**
   * Polling helper: waits for an element matching predicate or selector with timeout.
   * Matches OpenDroid GenericAppAutomator.retryUntilTimeout.
   */
  public async waitForElement(
    selector: string,
    timeoutMs = 4000,
    pollIntervalMs = 300
  ): Promise<AccessibilityNode | null> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const node = await this.findElement(selector)
      if (node) return node
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    return null
  }

  /**
   * Compares two screen states to detect whether an action produced a change.
   * Ported from Android Agent (ScreenChangeDetector).
   */
  public compareScreenStates(before: ScreenState, after: ScreenState): ScreenChangeComparison {
    if (before.packageName !== after.packageName) {
      return {
        level: 'SIGNIFICANT',
        similarityScore: 0.1,
        details: `App transitioned from ${before.packageName} to ${after.packageName}`
      }
    }

    if (before.screenHash === after.screenHash) {
      return {
        level: 'NONE',
        similarityScore: 1.0,
        details: 'Screen state is identical before and after action.'
      }
    }

    const beforeText = new Set(before.allVisibleText)
    const afterText = new Set(after.allVisibleText)
    let overlap = 0

    for (const t of afterText) {
      if (beforeText.has(t)) overlap++
    }

    const maxLen = Math.max(beforeText.size, afterText.size, 1)
    const similarity = overlap / maxLen

    if (similarity < 0.6) {
      return {
        level: 'SIGNIFICANT',
        similarityScore: similarity,
        details: `Major UI change detected (similarity: ${(similarity * 100).toFixed(0)}%)`
      }
    }

    return {
      level: 'MINOR',
      similarityScore: similarity,
      details: `Minor UI update detected (similarity: ${(similarity * 100).toFixed(0)}%)`
    }
  }

  // -------------------------------------------------------------
  // Private Helpers & Mock UI Tree System
  // -------------------------------------------------------------

  private computeScreenHash(pkg: string, texts: string[], elements: AccessibilityNode[]): string {
    const signature = `${pkg}|${texts.slice(0, 15).join('~')}|${elements.length}`
    let hash = 0
    for (let i = 0; i < signature.length; i++) {
      hash = (hash << 5) - hash + signature.charCodeAt(i)
      hash |= 0
    }
    return `hash_${Math.abs(hash)}`
  }

  private guessAppName(pkg: string): string {
    if (pkg.includes('youtube')) return 'YouTube'
    if (pkg.includes('maps')) return 'Google Maps'
    if (pkg.includes('whatsapp')) return 'WhatsApp'
    if (pkg.includes('chrome')) return 'Google Chrome'
    if (pkg.includes('settings')) return 'Settings'
    if (pkg.includes('camera')) return 'Camera'
    if (pkg.includes('dialer') || pkg.includes('phone')) return 'Phone'
    if (pkg.includes('messages')) return 'Messages'
    return 'Android App'
  }

  private handleNodeInteraction(node: AccessibilityNode, interactionType: 'tap' | 'type'): void {
    const text = (node.text || node.contentDescription || '').toLowerCase()

    // Interactive transitions
    if (text.includes('search') && this.currentPackage.includes('youtube')) {
      // Transition YouTube into Search Mode
      this.dynamicAppTrees.set(this.currentPackage, this.buildYouTubeSearchTree())
    } else if (text.includes('search') && this.currentPackage.includes('maps')) {
      this.dynamicAppTrees.set(this.currentPackage, this.buildMapsSearchTree())
    }
  }

  private updateActiveAppStateForInput(text: string): void {
    if (this.currentPackage.includes('youtube')) {
      this.dynamicAppTrees.set(this.currentPackage, this.buildYouTubeResultsTree(text))
    } else if (this.currentPackage.includes('maps')) {
      this.dynamicAppTrees.set(this.currentPackage, this.buildMapsResultsTree(text))
    }
  }

  private getOrBuildAppNodeTree(packageName: string): AccessibilityNode {
    if (this.dynamicAppTrees.has(packageName)) {
      return this.dynamicAppTrees.get(packageName)!
    }

    if (packageName.includes('youtube')) {
      const tree = this.buildYouTubeHomeTree()
      this.dynamicAppTrees.set(packageName, tree)
      return tree
    }

    if (packageName.includes('maps')) {
      const tree = this.buildMapsHomeTree()
      this.dynamicAppTrees.set(packageName, tree)
      return tree
    }

    if (packageName.includes('whatsapp')) {
      const tree = this.buildWhatsAppHomeTree()
      this.dynamicAppTrees.set(packageName, tree)
      return tree
    }

    if (packageName.includes('settings')) {
      const tree = this.buildSettingsTree()
      this.dynamicAppTrees.set(packageName, tree)
      return tree
    }

    if (packageName.includes('chrome')) {
      const tree = this.buildChromeTree()
      this.dynamicAppTrees.set(packageName, tree)
      return tree
    }

    return this.buildGenericAppTree(packageName)
  }

  private initDefaultMockTrees(): void {
    this.dynamicAppTrees.set('com.google.android.apps.nexuslauncher', this.buildHomeScreenTree())
  }

  private buildHomeScreenTree(): AccessibilityNode {
    return {
      id: 'root_home',
      text: '',
      contentDescription: 'Home screen',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.google.android.apps.nexuslauncher:id/workspace',
      packageName: 'com.google.android.apps.nexuslauncher',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'search_bar',
          text: 'Search apps, web and more',
          contentDescription: 'Google Search Bar',
          className: 'android.widget.EditText',
          viewIdResourceName: 'com.google.android.googlequicksearchbox:id/g_search',
          packageName: 'com.google.android.apps.nexuslauncher',
          bounds: {
            left: 60,
            top: 180,
            right: 1020,
            bottom: 300,
            width: 960,
            height: 120,
            centerX: 540,
            centerY: 240
          },
          isClickable: true,
          isScrollable: false,
          isEditable: true,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'app_yt',
          text: 'YouTube',
          contentDescription: 'YouTube app shortcut',
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.google.android.apps.nexuslauncher:id/icon_youtube',
          packageName: 'com.google.android.apps.nexuslauncher',
          bounds: {
            left: 60,
            top: 400,
            right: 260,
            bottom: 600,
            width: 200,
            height: 200,
            centerX: 160,
            centerY: 500
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'app_maps',
          text: 'Maps',
          contentDescription: 'Google Maps app shortcut',
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.google.android.apps.nexuslauncher:id/icon_maps',
          packageName: 'com.google.android.apps.nexuslauncher',
          bounds: {
            left: 300,
            top: 400,
            right: 500,
            bottom: 600,
            width: 200,
            height: 200,
            centerX: 400,
            centerY: 500
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'app_settings',
          text: 'Settings',
          contentDescription: 'Settings app shortcut',
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.google.android.apps.nexuslauncher:id/icon_settings',
          packageName: 'com.google.android.apps.nexuslauncher',
          bounds: {
            left: 540,
            top: 400,
            right: 740,
            bottom: 600,
            width: 200,
            height: 200,
            centerX: 640,
            centerY: 500
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildYouTubeHomeTree(): AccessibilityNode {
    return {
      id: 'yt_root',
      text: '',
      contentDescription: 'YouTube Home',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.google.android.youtube:id/pane_fragment_container',
      packageName: 'com.google.android.youtube',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'yt_logo',
          text: 'YouTube',
          contentDescription: 'YouTube logo',
          className: 'android.widget.ImageView',
          viewIdResourceName: 'com.google.android.youtube:id/youtube_logo',
          packageName: 'com.google.android.youtube',
          bounds: {
            left: 40,
            top: 120,
            right: 280,
            bottom: 200,
            width: 240,
            height: 80,
            centerX: 160,
            centerY: 160
          },
          isClickable: false,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'yt_search_btn',
          text: 'Search',
          contentDescription: 'Search YouTube',
          className: 'android.widget.ImageView',
          viewIdResourceName: 'com.google.android.youtube:id/menu_item_search',
          packageName: 'com.google.android.youtube',
          bounds: {
            left: 880,
            top: 120,
            right: 1000,
            bottom: 200,
            width: 120,
            height: 80,
            centerX: 940,
            centerY: 160
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'yt_feed_item_1',
          text: 'Recommended Videos & Trends',
          contentDescription: 'Trending Feed',
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.google.android.youtube:id/title',
          packageName: 'com.google.android.youtube',
          bounds: {
            left: 40,
            top: 260,
            right: 1040,
            bottom: 800,
            width: 1000,
            height: 540,
            centerX: 540,
            centerY: 530
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildYouTubeSearchTree(): AccessibilityNode {
    return {
      id: 'yt_search_root',
      text: '',
      contentDescription: 'YouTube Search Screen',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.google.android.youtube:id/search_container',
      packageName: 'com.google.android.youtube',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'yt_search_input',
          text: '',
          contentDescription: 'Search YouTube text box',
          className: 'android.widget.EditText',
          viewIdResourceName: 'com.google.android.youtube:id/search_edit_text',
          packageName: 'com.google.android.youtube',
          bounds: {
            left: 160,
            top: 120,
            right: 960,
            bottom: 220,
            width: 800,
            height: 100,
            centerX: 560,
            centerY: 170
          },
          isClickable: true,
          isScrollable: false,
          isEditable: true,
          isEnabled: true,
          isFocused: true,
          children: []
        },
        {
          id: 'yt_search_submit',
          text: 'Search',
          contentDescription: 'Search button',
          className: 'android.widget.Button',
          viewIdResourceName: 'com.google.android.youtube:id/search_button',
          packageName: 'com.google.android.youtube',
          bounds: {
            left: 960,
            top: 120,
            right: 1060,
            bottom: 220,
            width: 100,
            height: 100,
            centerX: 1010,
            centerY: 170
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildYouTubeResultsTree(query: string): AccessibilityNode {
    return {
      id: 'yt_results_root',
      text: '',
      contentDescription: `Search results for ${query}`,
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.google.android.youtube:id/results_list',
      packageName: 'com.google.android.youtube',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'yt_query_header',
          text: `Results for "${query}"`,
          contentDescription: `Query header`,
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.google.android.youtube:id/query_display',
          packageName: 'com.google.android.youtube',
          bounds: {
            left: 40,
            top: 120,
            right: 900,
            bottom: 200,
            width: 860,
            height: 80,
            centerX: 470,
            centerY: 160
          },
          isClickable: false,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'yt_video_1',
          text: `${query} - Official Gameplay & Walkthrough`,
          contentDescription: `First video result for ${query}`,
          className: 'android.widget.LinearLayout',
          viewIdResourceName: 'com.google.android.youtube:id/video_item_1',
          packageName: 'com.google.android.youtube',
          bounds: {
            left: 40,
            top: 240,
            right: 1040,
            bottom: 840,
            width: 1000,
            height: 600,
            centerX: 540,
            centerY: 540
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildMapsHomeTree(): AccessibilityNode {
    return {
      id: 'maps_root',
      text: '',
      contentDescription: 'Google Maps View',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.google.android.apps.maps:id/main_map_container',
      packageName: 'com.google.android.apps.maps',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'maps_search_bar',
          text: 'Search here',
          contentDescription: 'Search Google Maps',
          className: 'android.widget.EditText',
          viewIdResourceName: 'com.google.android.apps.maps:id/search_omnibox_text_box',
          packageName: 'com.google.android.apps.maps',
          bounds: {
            left: 60,
            top: 120,
            right: 1020,
            bottom: 220,
            width: 960,
            height: 100,
            centerX: 540,
            centerY: 170
          },
          isClickable: true,
          isScrollable: false,
          isEditable: true,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'maps_directions_btn',
          text: 'Directions',
          contentDescription: 'Get Directions',
          className: 'android.widget.Button',
          viewIdResourceName: 'com.google.android.apps.maps:id/directions_button',
          packageName: 'com.google.android.apps.maps',
          bounds: {
            left: 860,
            top: 1800,
            right: 1020,
            bottom: 1960,
            width: 160,
            height: 160,
            centerX: 940,
            centerY: 1880
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildMapsSearchTree(): AccessibilityNode {
    return {
      id: 'maps_search_root',
      text: '',
      contentDescription: 'Google Maps Search Box',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.google.android.apps.maps:id/search_box',
      packageName: 'com.google.android.apps.maps',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: false,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'maps_active_search',
          text: '',
          contentDescription: 'Search destination',
          className: 'android.widget.EditText',
          viewIdResourceName: 'com.google.android.apps.maps:id/search_edit_text',
          packageName: 'com.google.android.apps.maps',
          bounds: {
            left: 160,
            top: 120,
            right: 980,
            bottom: 220,
            width: 820,
            height: 100,
            centerX: 570,
            centerY: 170
          },
          isClickable: true,
          isScrollable: false,
          isEditable: true,
          isEnabled: true,
          isFocused: true,
          children: []
        }
      ]
    }
  }

  private buildMapsResultsTree(query: string): AccessibilityNode {
    return {
      id: 'maps_results_root',
      text: '',
      contentDescription: `Maps results for ${query}`,
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.google.android.apps.maps:id/place_details',
      packageName: 'com.google.android.apps.maps',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'maps_place_title',
          text: query,
          contentDescription: `Place name: ${query}`,
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.google.android.apps.maps:id/title',
          packageName: 'com.google.android.apps.maps',
          bounds: {
            left: 60,
            top: 1600,
            right: 800,
            bottom: 1720,
            width: 740,
            height: 120,
            centerX: 430,
            centerY: 1660
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'maps_directions_action',
          text: 'Directions',
          contentDescription: `Start navigation to ${query}`,
          className: 'android.widget.Button',
          viewIdResourceName: 'com.google.android.apps.maps:id/start_directions_button',
          packageName: 'com.google.android.apps.maps',
          bounds: {
            left: 60,
            top: 1760,
            right: 400,
            bottom: 1880,
            width: 340,
            height: 120,
            centerX: 230,
            centerY: 1820
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildWhatsAppHomeTree(): AccessibilityNode {
    return {
      id: 'wa_root',
      text: '',
      contentDescription: 'WhatsApp Main Screen',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.whatsapp:id/home_container',
      packageName: 'com.whatsapp',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'wa_title',
          text: 'WhatsApp',
          contentDescription: 'WhatsApp title',
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.whatsapp:id/title',
          packageName: 'com.whatsapp',
          bounds: {
            left: 40,
            top: 120,
            right: 300,
            bottom: 200,
            width: 260,
            height: 80,
            centerX: 170,
            centerY: 160
          },
          isClickable: false,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'wa_search',
          text: 'Search',
          contentDescription: 'Search chats and contacts',
          className: 'android.widget.ImageView',
          viewIdResourceName: 'com.whatsapp:id/menuitem_search',
          packageName: 'com.whatsapp',
          bounds: {
            left: 880,
            top: 120,
            right: 980,
            bottom: 200,
            width: 100,
            height: 80,
            centerX: 930,
            centerY: 160
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'wa_chat_1',
          text: 'Family Group',
          contentDescription: 'Chat: Family Group',
          className: 'android.widget.LinearLayout',
          viewIdResourceName: 'com.whatsapp:id/conversations_row',
          packageName: 'com.whatsapp',
          bounds: {
            left: 40,
            top: 240,
            right: 1040,
            bottom: 380,
            width: 1000,
            height: 140,
            centerX: 540,
            centerY: 310
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildSettingsTree(): AccessibilityNode {
    return {
      id: 'settings_root',
      text: '',
      contentDescription: 'Android Settings',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.android.settings:id/settings_homepage_container',
      packageName: 'com.android.settings',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'settings_title',
          text: 'Settings',
          contentDescription: 'Settings header',
          className: 'android.widget.TextView',
          viewIdResourceName: 'com.android.settings:id/homepage_title',
          packageName: 'com.android.settings',
          bounds: {
            left: 60,
            top: 140,
            right: 400,
            bottom: 240,
            width: 340,
            height: 100,
            centerX: 230,
            centerY: 190
          },
          isClickable: false,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'settings_search',
          text: 'Search settings',
          contentDescription: 'Search settings',
          className: 'android.widget.EditText',
          viewIdResourceName: 'com.android.settings:id/search_action_bar_title',
          packageName: 'com.android.settings',
          bounds: {
            left: 60,
            top: 260,
            right: 1020,
            bottom: 360,
            width: 960,
            height: 100,
            centerX: 540,
            centerY: 310
          },
          isClickable: true,
          isScrollable: false,
          isEditable: true,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'settings_network',
          text: 'Network & internet',
          contentDescription: 'Wi-Fi, mobile, hotspot',
          className: 'android.widget.LinearLayout',
          viewIdResourceName: 'com.android.settings:id/network_pref',
          packageName: 'com.android.settings',
          bounds: {
            left: 60,
            top: 400,
            right: 1020,
            bottom: 520,
            width: 960,
            height: 120,
            centerX: 540,
            centerY: 460
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: 'settings_display',
          text: 'Display',
          contentDescription: 'Dark theme, font size, wallpaper',
          className: 'android.widget.LinearLayout',
          viewIdResourceName: 'com.android.settings:id/display_pref',
          packageName: 'com.android.settings',
          bounds: {
            left: 60,
            top: 540,
            right: 1020,
            bottom: 660,
            width: 960,
            height: 120,
            centerX: 540,
            centerY: 600
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildChromeTree(): AccessibilityNode {
    return {
      id: 'chrome_root',
      text: '',
      contentDescription: 'Google Chrome Browser',
      className: 'android.widget.FrameLayout',
      viewIdResourceName: 'com.android.chrome:id/main_content',
      packageName: 'com.android.chrome',
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: 'chrome_url_bar',
          text: 'Search or type web address',
          contentDescription: 'Search or type URL',
          className: 'android.widget.EditText',
          viewIdResourceName: 'com.android.chrome:id/url_bar',
          packageName: 'com.android.chrome',
          bounds: {
            left: 60,
            top: 120,
            right: 900,
            bottom: 220,
            width: 840,
            height: 100,
            centerX: 480,
            centerY: 170
          },
          isClickable: true,
          isScrollable: false,
          isEditable: true,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }

  private buildGenericAppTree(packageName: string): AccessibilityNode {
    const name = this.guessAppName(packageName)
    return {
      id: `generic_${packageName}`,
      text: '',
      contentDescription: `${name} Screen`,
      className: 'android.widget.FrameLayout',
      viewIdResourceName: `${packageName}:id/content`,
      packageName,
      bounds: {
        left: 0,
        top: 0,
        right: 1080,
        bottom: 2400,
        width: 1080,
        height: 2400,
        centerX: 540,
        centerY: 1200
      },
      isClickable: false,
      isScrollable: true,
      isEditable: false,
      isEnabled: true,
      isFocused: false,
      children: [
        {
          id: `title_${packageName}`,
          text: name,
          contentDescription: `${name} title bar`,
          className: 'android.widget.TextView',
          viewIdResourceName: `${packageName}:id/action_bar_title`,
          packageName,
          bounds: {
            left: 60,
            top: 120,
            right: 600,
            bottom: 220,
            width: 540,
            height: 100,
            centerX: 330,
            centerY: 170
          },
          isClickable: false,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        },
        {
          id: `search_${packageName}`,
          text: 'Search',
          contentDescription: 'Search',
          className: 'android.widget.ImageView',
          viewIdResourceName: `${packageName}:id/search_icon`,
          packageName,
          bounds: {
            left: 900,
            top: 120,
            right: 1020,
            bottom: 220,
            width: 120,
            height: 100,
            centerX: 960,
            centerY: 170
          },
          isClickable: true,
          isScrollable: false,
          isEditable: false,
          isEnabled: true,
          isFocused: false,
          children: []
        }
      ]
    }
  }
}

export const accessibilityService = AccessibilityService.getInstance()
