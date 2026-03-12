export type Listener<T> = (state: T) => void;

export type Store<T> = {
  getState: () => T;
  setState: (next: T) => void;
  update: (fn: (prev: T) => T) => void;
  subscribe: (listener: Listener<T>) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  return {
    getState: () => state,
    setState: (next) => {
      state = next;
      notify();
    },
    update: (fn) => {
      state = fn(state);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
