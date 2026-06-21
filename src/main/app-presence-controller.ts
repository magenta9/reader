import type { NativeImage } from "electron";
import { readFileSync } from "node:fs";

export interface AppPresenceDock {
  show(): Promise<void> | void;
  setIcon(image: NativeImage): void;
}

export interface AppPresenceApp {
  dock?: AppPresenceDock;
  hide(): void;
}

export interface AppPresenceNativeImage {
  createFromDataURL(dataUrl: string): NativeImage;
}

export interface AppPresenceReaderWindow {
  hide(): void;
}

export interface AppPresenceControllerOptions {
  app: AppPresenceApp;
  nativeImage: AppPresenceNativeImage;
  getReaderWindow: () => AppPresenceReaderWindow | undefined;
  platform?: NodeJS.Platform;
  readTextFile?: (path: string) => string;
}

export class AppPresenceController {
  constructor(private readonly options: AppPresenceControllerOptions) {}

  ensureDockVisible(): void {
    void this.options.app.dock?.show();
  }

  setDockIconFromSvg(svgPath: string): void {
    if (!this.options.app.dock) return;
    const svg = this.readAssetText(svgPath);
    if (!svg) return;
    const image = this.options.nativeImage.createFromDataURL(svgDataUrl(svg));
    if (!image.isEmpty()) this.options.app.dock.setIcon(image);
  }

  hideForSelectionCapture(): void {
    if ((this.options.platform ?? process.platform) === "darwin") {
      this.options.app.hide();
      this.ensureDockVisible();
      return;
    }

    this.options.getReaderWindow()?.hide();
  }

  private readAssetText(path: string): string {
    try {
      const readTextFile = this.options.readTextFile ?? ((filePath: string) => readFileSync(filePath, "utf8"));
      return readTextFile(path);
    } catch {
      return "";
    }
  }
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
