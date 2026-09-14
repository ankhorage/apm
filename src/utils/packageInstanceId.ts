/*** Build the globally stable APM identity for one manager-native package instance. */
export function packageInstanceId(installRootId: string, packageId: string): string {
  return `${installRootId}::${packageId}`;
}
