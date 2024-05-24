import { useSyncExternalStore } from 'react'

export const logMiddleware = (fn) => {
  return (set, get, api) => {
    const logSet = (updater) => {
      console.log('log', typeof updater === 'function' ? updater(api.getState()) : updater)
      set(updater)
    }
   return fn(logSet, get, api)
  }
}

const createStore = (createState) => {
  let state
  const listeners = new Set([])

  const setState = (partial) => {
    const nextState =  typeof partial === 'function' ? partial(state) : partial

    if(!Object.is(state, nextState)) {
      state = Object.assign({}, state, nextState)
      listeners.forEach(listener => listener(state))
    }
  }

  const getState = () => state

  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const api = { setState, getState, subscribe }

  state = createState(setState, getState, api)

  return api
}

const identity = (arg) => arg
const useStore = (api, selector = identity) => {
  const value = useSyncExternalStore(api.subscribe, () => selector(api.getState()) )
  return value
}

export const create = (createState) => {
  const api = createStore(createState)
  const useBoundStore = (selector?) => useStore(api, selector)
  return useBoundStore
}
