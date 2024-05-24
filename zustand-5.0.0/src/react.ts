// import { useDebugValue, useSyncExternalStore } from 'react'
// That doesn't work in ESM, because React libs are CJS only.
// See: https://github.com/pmndrs/valtio/issues/452
// The following is a workaround until ESM is supported.
// eslint-disable-next-line import/extensions
import ReactExports from 'react'
import { createStore } from './vanilla.ts'
import type {
  Mutate,
  StateCreator,
  StoreApi,
  StoreMutatorIdentifier,
} from './vanilla.ts'

const { useDebugValue, useSyncExternalStore } = ReactExports

type ExtractState<S> = S extends { getState: () => infer T } ? T : never

type ReadonlyStoreApi<T> = Pick<StoreApi<T>, 'getState' | 'subscribe'>

const identity = <T>(arg: T): T => arg
export function useStore<S extends StoreApi<unknown>>(api: S): ExtractState<S>

export function useStore<S extends StoreApi<unknown>, U>(
  api: S,
  selector: (state: ExtractState<S>) => U,
): U

// ZUSTAND-流程设计 3-获取存储
export function useStore<TState, StateSlice>(
  api: StoreApi<TState>,
  selector: (state: TState) => StateSlice = identity as any, // 不传返回整合 state; === (arg) => arg
) {
  // useSyncExternalStore 是 React 提供的 hooks https://zh-hans.react.dev/reference/react/useSyncExternalStore
  // 允许订阅外部存储库状态，当订阅函数执行时，会重新渲染组件
  const slice = useSyncExternalStore(
    api.subscribe, // 订阅方法
    () => selector(api.getState()), // 状态方法
    () => selector(api.getInitialState()), // 服务端初始方法
  )
  useDebugValue(slice)
  return slice // 状态
}

export type UseBoundStore<S extends ReadonlyStoreApi<unknown>> = {
  (): ExtractState<S>
  <U>(selector: (state: ExtractState<S>) => U): U
} & S

type Create = {
  <T, Mos extends [StoreMutatorIdentifier, unknown][] = []>(
    initializer: StateCreator<T, [], Mos>,
  ): UseBoundStore<Mutate<StoreApi<T>, Mos>>
  <T>(): <Mos extends [StoreMutatorIdentifier, unknown][] = []>(
    initializer: StateCreator<T, [], Mos>,
  ) => UseBoundStore<Mutate<StoreApi<T>, Mos>>
}

const createImpl = <T>(createState: StateCreator<T, [], []>) => {
  // 创建存储
  const api = createStore(createState)

  // 返回 store hooks 在 React 中可以使用，其实就是 useSyncExternalStore 的封装
  // useXxxStore()
  // useXxxStore((state) => state.count)
  const useBoundStore: any = (selector?: any) => useStore(api, selector)
  Object.assign(useBoundStore, api)
  return useBoundStore
}

// ZUSTAND-流程设计 1-创建流程
// createState 是我们创建的传入的函数
// create((get, set, api) => ({}))
export const create = (<T>(createState: StateCreator<T, [], []> | undefined) =>
  createState ? createImpl(createState) : createImpl) as Create
