import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

// function App() {
// 	return (
// 		<ul>
// 			<li>1</li>
// 			<li>2</li>
// 		</ul>
// 	);
// }

// function App() {
// 	const [num, update] = useState(100);
// 	const [num1, update1] = useState(100);
// 	return (
// 		<ul>
// 			<li onClick={() => update(50)}>{num}</li>
// 			<li onClick={() => update1(50)}>{num1}</li>
// 		</ul>
// 	);
// }

function App() {
	const [num, update] = useState(100);
	useEffect(() => {
		console.log('mount', num);
		return () => {
			console.log('unmount', num);
		};
	}, [num]);

	const [num1, update1] = useState(100);
	useEffect(() => {
		console.log('mount1', num1);
		return () => {
			console.log('unmount1', num1);
		};
	}, [num1]);

	return (
		<ul>
			<li onClick={() => update(50)}>{num}</li>
			<li onClick={() => update1(50)}>{num1}</li>
		</ul>
	);
}

// function App() {
// 	const [num, update] = useState(100);
// 	return (
// 		<ul onClick={() => update(50)}>
// 			{new Array(num).fill(0).map((_, i) => {
// 				return <Child key={i}>{i}</Child>;
// 			})}
// 		</ul>
// 	);
// }

// function Child({ children }) {
// 	const now = performance.now();
// 	while (performance.now() - now < 4) {}
// 	return <li>{children}</li>;
// }

const root = ReactDOM.createRoot(document.querySelector('#root'));

root.render(<App />);
