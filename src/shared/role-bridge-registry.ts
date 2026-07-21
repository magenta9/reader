export interface RendererRoleBridgeTransport {
  invoke(channel: string, args: readonly unknown[]): Promise<unknown>;
  subscribe(channel: string, listener: (...args: unknown[]) => void): () => void;
}

export interface MainRoleHandlerTransport {
  handle(
    channel: string,
    handler: (args: readonly unknown[]) => unknown
  ): void;
}

export interface MainRoleEventTransport {
  emit(channel: string, args: readonly unknown[]): void;
}

export type MainRoleBridgeTransport = MainRoleHandlerTransport & MainRoleEventTransport;

export interface InvokeEndpoint<
  Method extends string,
  Args extends readonly unknown[],
  Result
> {
  readonly kind: "invoke";
  readonly method: Method;
  readonly channel: string;
  readonly __args?: Args;
  readonly __result?: Result;
}

export interface EventEndpoint<
  Method extends string,
  EmitMethod extends string,
  Args extends readonly unknown[]
> {
  readonly kind: "event";
  readonly method: Method;
  readonly emitMethod: EmitMethod;
  readonly channel: string;
  readonly __args?: Args;
}

type AnyInvokeEndpoint = InvokeEndpoint<string, readonly unknown[], unknown>;
type AnyEventEndpoint = EventEndpoint<string, string, readonly unknown[]>;
type AnyEndpoint = AnyInvokeEndpoint | AnyEventEndpoint;

export interface RoleBridgeContract<
  Role extends string,
  Endpoints extends readonly AnyEndpoint[]
> {
  readonly role: Role;
  readonly endpoints: Endpoints;
}

type AnyRoleBridgeContract = RoleBridgeContract<string, readonly AnyEndpoint[]>;

export interface RoleBridgeRegistry<Contracts extends readonly AnyRoleBridgeContract[]> {
  readonly contracts: Contracts;
}

export function invokeEndpoint<Args extends readonly unknown[], Result>() {
  return <Method extends string>(method: Method, channel: string): InvokeEndpoint<Method, Args, Result> => ({
    kind: "invoke",
    method,
    channel
  });
}

export function eventEndpoint<Args extends readonly unknown[]>() {
  return <Method extends string, EmitMethod extends string>(
    method: Method,
    emitMethod: EmitMethod,
    channel: string
  ): EventEndpoint<Method, EmitMethod, Args> => ({
    kind: "event",
    method,
    emitMethod,
    channel
  });
}

export function defineRoleBridgeContract<
  const Role extends string,
  const Endpoints extends readonly AnyEndpoint[]
>(role: Role, endpoints: Endpoints): RoleBridgeContract<Role, Endpoints> {
  validateContract(role, endpoints);
  return Object.freeze({ role, endpoints: Object.freeze([...endpoints]) as unknown as Endpoints });
}

export function defineRoleBridgeRegistry<const Contracts extends readonly AnyRoleBridgeContract[]>(
  contracts: Contracts
): RoleBridgeRegistry<Contracts> {
  const roles = new Set<string>();
  const channelsByDirection = new Set<string>();
  for (const contract of contracts) {
    if (roles.has(contract.role)) throw new Error(`Bridge registry has duplicate role ${contract.role}`);
    roles.add(contract.role);
    for (const endpoint of contract.endpoints) {
      const channelKey = `${endpoint.kind}:${endpoint.channel}`;
      if (channelsByDirection.has(channelKey)) {
        throw new Error(`Bridge registry has duplicate endpoint channel ${endpoint.channel}`);
      }
      channelsByDirection.add(channelKey);
    }
  }
  return Object.freeze({ contracts: Object.freeze([...contracts]) as unknown as Contracts });
}

export function getRoleBridgeContract(
  registry: RoleBridgeRegistry<readonly AnyRoleBridgeContract[]>,
  role: string
): AnyRoleBridgeContract {
  const contract = registry.contracts.find((candidate) => candidate.role === role);
  if (!contract) throw new Error(`Unknown bridge role ${role}`);
  return contract;
}

export function createRoleBridge<Contract extends AnyRoleBridgeContract>(
  contract: Contract,
  transport: RendererRoleBridgeTransport
): BridgeFromContract<Contract> {
  const bridge: Record<string, unknown> = {};
  for (const endpoint of contract.endpoints) {
    if (endpoint.kind === "invoke") {
      bridge[endpoint.method] = (...args: unknown[]) => transport.invoke(endpoint.channel, args);
    } else {
      bridge[endpoint.method] = (listener: unknown) => {
        if (typeof listener !== "function") {
          throw new Error(`${contract.role}.${endpoint.method} requires an event listener`);
        }
        return transport.subscribe(endpoint.channel, (...args) => Reflect.apply(listener, undefined, args));
      };
    }
  }
  return Object.freeze(bridge) as BridgeFromContract<Contract>;
}

export function registerRoleHandlers<Contract extends AnyRoleBridgeContract>(
  contract: Contract,
  implementation: ImplementationFromContract<Contract>,
  transport: MainRoleHandlerTransport
): void {
  const invokeEndpoints = contract.endpoints.filter(
    (endpoint): endpoint is AnyInvokeEndpoint => endpoint.kind === "invoke"
  );
  for (const endpoint of invokeEndpoints) {
    if (typeof Reflect.get(implementation, endpoint.method) !== "function") {
      throw new Error(`Bridge role ${contract.role} is missing implementation ${endpoint.method}`);
    }
  }
  for (const endpoint of invokeEndpoints) {
    const handler = Reflect.get(implementation, endpoint.method) as (...args: unknown[]) => unknown;
    transport.handle(endpoint.channel, (args) => Reflect.apply(handler, implementation, args));
  }
}

export function createRoleEventEmitter<Contract extends AnyRoleBridgeContract>(
  contract: Contract,
  transport: MainRoleEventTransport
): EventEmitterFromContract<Contract> {
  const emitter: Record<string, unknown> = {};
  for (const endpoint of contract.endpoints) {
    if (endpoint.kind !== "event") continue;
    emitter[endpoint.emitMethod] = (...args: unknown[]) => transport.emit(endpoint.channel, args);
  }
  return Object.freeze(emitter) as EventEmitterFromContract<Contract>;
}

type EndpointBridge<Endpoint> = Endpoint extends InvokeEndpoint<infer Method, infer Args, infer Result>
  ? { [Key in Method]: (...args: Args) => Promise<Awaited<Result>> }
  : Endpoint extends EventEndpoint<infer Method, string, infer Args>
    ? { [Key in Method]: (listener: (...args: Args) => void) => () => void }
    : never;

type EndpointImplementation<Endpoint> = Endpoint extends InvokeEndpoint<
  infer Method,
  infer Args,
  infer Result
>
  ? { [Key in Method]: (...args: Args) => Result | Promise<Result> }
  : never;

type EndpointEmitter<Endpoint> = Endpoint extends EventEndpoint<string, infer EmitMethod, infer Args>
  ? { [Key in EmitMethod]: (...args: Args) => void }
  : never;

type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

type Simplify<Value> = { [Key in keyof Value]: Value[Key] };

export type BridgeFromContract<Contract extends AnyRoleBridgeContract> = Simplify<
  UnionToIntersection<EndpointBridge<Contract["endpoints"][number]>>
>;

export type ImplementationFromContract<Contract extends AnyRoleBridgeContract> = Simplify<
  UnionToIntersection<EndpointImplementation<Contract["endpoints"][number]>>
>;

export type EventEmitterFromContract<Contract extends AnyRoleBridgeContract> = Simplify<
  UnionToIntersection<EndpointEmitter<Contract["endpoints"][number]>>
>;

function validateContract(role: string, endpoints: readonly AnyEndpoint[]): void {
  const methods = new Set<string>();
  const channelsByDirection = new Set<string>();
  const emitMethods = new Set<string>();
  for (const endpoint of endpoints) {
    if (methods.has(endpoint.method)) {
      throw new Error(`Bridge role ${role} has duplicate endpoint method ${endpoint.method}`);
    }
    methods.add(endpoint.method);
    const channelKey = `${endpoint.kind}:${endpoint.channel}`;
    if (channelsByDirection.has(channelKey)) {
      throw new Error(`Bridge role ${role} has duplicate endpoint channel ${endpoint.channel}`);
    }
    channelsByDirection.add(channelKey);
    if (endpoint.kind === "event") {
      if (emitMethods.has(endpoint.emitMethod)) {
        throw new Error(`Bridge role ${role} has duplicate event emitter ${endpoint.emitMethod}`);
      }
      emitMethods.add(endpoint.emitMethod);
    }
  }
}
