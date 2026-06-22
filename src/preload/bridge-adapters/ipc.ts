import type { IpcRendererEvent } from "electron";

export interface PreloadIpc {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;
  off: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;
}

export function invoke<T>(ipc: PreloadIpc, channel: string, ...args: unknown[]): Promise<T> {
  return ipc.invoke(channel, ...args) as Promise<T>;
}

export function subscribe<T>(ipc: PreloadIpc, channel: string, listener: (payload: T) => void): () => void {
  const handler: PreloadIpcListener = (_event, payload) => listener(payload as T);
  ipc.on(channel, handler);
  return () => ipc.off(channel, handler);
}

export function subscribeVoid(ipc: PreloadIpc, channel: string, listener: () => void): () => void {
  const handler = () => listener();
  ipc.on(channel, handler);
  return () => ipc.off(channel, handler);
}

type PreloadIpcListener = Parameters<PreloadIpc["on"]>[1];
