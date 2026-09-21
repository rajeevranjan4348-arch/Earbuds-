/**
 * Authentic port of fr.neamar.kiss.utils.UserHandle from Neamar/KISS
 * Represents an Android user profile (e.g. Personal vs Work Profile)
 */

export class UserHandle {
  public static readonly OWNER = new UserHandle(0, 'owner')

  public readonly id: number
  public readonly name: string

  constructor(id: number = 0, name: string = 'owner') {
    this.id = id
    this.name = name
  }

  public addUserSuffixToString(base: string, separator: string = '#'): string {
    if (this.id === 0) {
      return base
    }
    return `${base}${separator}${this.id}`
  }

  public toString(): string {
    return `UserHandle{id=${this.id}, name='${this.name}'}`
  }
}

/**
 * Authentic port of android.content.ComponentName from Android SDK / KISS
 */
export class ComponentName {
  public readonly packageName: string
  public readonly activityName: string

  constructor(packageName: string, activityName: string) {
    this.packageName = packageName
    this.activityName = activityName
  }

  public flattenToString(): string {
    return `${this.packageName}/${this.activityName}`
  }

  public toString(): string {
    return `ComponentName{${this.flattenToString()}}`
  }
}
