import { create } from "../../../zustand-5.0.0/src";

interface State {
  count: number;
  increment: () => void;
  decrement: () => void;
  incrementIfOdd: () => void;
  incrementAsync: () => Promise<void>;
}

export const useStore = create<State>(
  // 传入一个函数，并且可以接收三个参数
  (set, get) => ({
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
          resolve();
        }, 1000);
      });
    },
  })
);
