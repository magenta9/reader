import type {
  MainRoleBridgeTransport,
  RendererRoleBridgeTransport
} from "./role-bridge-registry.js";

export class InMemoryRoleBridgeLoopback
  implements MainRoleBridgeTransport, RendererRoleBridgeTransport
{
  private readonly handlers = new Map<
    string,
    (context: {}, args: readonly unknown[]) => unknown
  >();
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  handle(channel: string, handler: (context: {}, args: readonly unknown[]) => unknown): void {
    if (this.handlers.has(channel)) throw new Error(`Handler already registered for ${channel}`);
    this.handlers.set(channel, handler);
  }

  async invoke(channel: string, args: readonly unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler registered for ${channel}`);
    return handler({}, args);
  }

  subscribe(channel: string, listener: (...args: unknown[]) => void): () => void {
    const listeners = this.listeners.get(channel) ?? new Set();
    listeners.add(listener);
    this.listeners.set(channel, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(channel);
    };
  }

  emit(channel: string, args: readonly unknown[]): void {
    for (const listener of [...(this.listeners.get(channel) ?? [])]) listener(...args);
  }
}
