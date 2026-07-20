export interface ReaderSurfaceStartupDependencies {
  launchAtLoginCommands: { initialize(): void };
  playbackCommands: { registerActivationShortcut(): void };
  readerAppShell: { start(): Promise<void> };
}

export function startReaderSurfaces({
  launchAtLoginCommands,
  playbackCommands,
  readerAppShell
}: ReaderSurfaceStartupDependencies): Promise<void> {
  launchAtLoginCommands.initialize();
  playbackCommands.registerActivationShortcut();
  return readerAppShell.start();
}
