import { create, logMiddleware } from "../zustand";

export const useStore = create(
  logMiddleware((set, get) => ({
    count: 0,
    increment: () => {
      set((state) => ({ count: state.count + 1 }));
    },
    decrement: () => {
      set((state) => ({ count: state.count + 1 }));
    },
    incrementIfOdd: () => {
      if ((get().count + 1) % 2 === 0) {
        get().increment();
      }
    },
    incrementAsync: () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          get().increment();
          resolve(null);
        }, 1000);
      });
    },
  }))
);
