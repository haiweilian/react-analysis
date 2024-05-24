import { useStore } from './store'

function App() {
  const store = useStore()
  const count = useStore((state) => state.count)
  const evenOrOdd = useStore((state) => state.count % 2 === 0 ? "even" : "odd")
  return (
    <div>
      Clicked: { count } times, count is { evenOrOdd }.
      <button onClick={store.increment}>+</button>
      <button onClick={store.decrement}>-</button>
      <button onClick={store.incrementIfOdd}>Increment if odd</button>
      <button onClick={store.incrementAsync}>Increment async</button>
    </div>
  )
}

export default App
