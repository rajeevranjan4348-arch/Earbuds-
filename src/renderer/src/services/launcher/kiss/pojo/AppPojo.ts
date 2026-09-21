/**
 * Authentic port of fr.neamar.kiss.pojo.AppPojo from Neamar/KISS
 * Represents an installed Android application and launchable activity.
 */

import { ComponentName, UserHandle } from './UserHandle'
import { PojoWithTags } from './Pojo'

export class AppPojo extends PojoWithTags {
  public static getComponentName(
    packageName: string,
    activityName: string,
    userHandle: UserHandle = UserHandle.OWNER
  ): string {
    return userHandle.addUserSuffixToString(`${packageName}/${activityName}`, '#')
  }

  public readonly packageName: string
  public readonly activityName: string
  private readonly componentName: ComponentName
  public readonly userHandle: UserHandle

  private _excluded: boolean
  private _excludedFromHistory: boolean
  private _excludedShortcuts: boolean
  private readonly _disabled: boolean
  public readonly isSystemApp: boolean
  public readonly category?: string
  public readonly customAliases: string[]

  constructor(
    id: string,
    packageName: string,
    activityName: string,
    userHandle: UserHandle = UserHandle.OWNER,
    isExcluded = false,
    isExcludedFromHistory = false,
    isExcludedShortcuts = false,
    disabled = false,
    isSystemApp = false,
    category?: string,
    customAliases: string[] = []
  ) {
    super(id)
    this.packageName = packageName
    this.activityName = activityName
    this.userHandle = userHandle
    this._excluded = isExcluded
    this._excludedFromHistory = isExcludedFromHistory
    this._excludedShortcuts = isExcludedShortcuts
    this._disabled = disabled
    this.isSystemApp = isSystemApp
    this.category = category
    this.customAliases = customAliases
    this.componentName = new ComponentName(packageName, activityName)
  }

  public getComponentName(): string {
    return AppPojo.getComponentName(this.packageName, this.activityName, this.userHandle)
  }

  public getComponent(): ComponentName {
    return this.componentName
  }

  public isExcluded(): boolean {
    return this._excluded
  }

  public setExcluded(excluded: boolean): void {
    this._excluded = excluded
  }

  public isExcludedFromHistory(): boolean {
    return this._excludedFromHistory
  }

  public setExcludedFromHistory(excluded: boolean): void {
    this._excludedFromHistory = excluded
  }

  public isExcludedShortcuts(): boolean {
    return this._excludedShortcuts
  }

  public setExcludedShortcuts(excluded: boolean): void {
    this._excludedShortcuts = excluded
  }

  public override isDisabled(): boolean {
    return this._disabled
  }

  public override getUserHandle(): UserHandle {
    return this.userHandle
  }

  public getPackageKey(): string {
    return `${this.userHandle.id}|${this.packageName}`
  }

  public getCustomIconId(): string {
    return this.getComponent().flattenToString()
  }
}
