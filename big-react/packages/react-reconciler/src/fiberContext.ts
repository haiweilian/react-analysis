import { ReactContext } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import {
	Lane,
	NoLanes,
	includeSomeLanes,
	isSubsetOfLanes,
	mergeLanes
} from './fiberLanes';
import { markWipReceivedUpdate } from './beginWork';
import { ContextProvider } from './workTags';

let lastContextDep: ContextItem<any> | null = null;

export interface ContextItem<Value> {
	context: ReactContext<Value>;
	memoizedState: Value;
	next: ContextItem<Value> | null;
}

// REACT-Context 4. Provider 存/取值处理

// 使用一个栈保存值
// 当多个嵌套 provider 的时候以便可以恢复上次的值。
// <CtxA.Provider value={'A0'}>
// 	<CtxA.Provider value={'A1'}>
// 		<Cpn /> // 递到底了，归的过程中恢复上次的值，以便可以让 Cpn1 可以正确获取到 'AO'
// 	</CtxA.Provider>
// 	<Cpn1 />
// </CtxA.Provider>
let prevContextValue: any = null;
const prevContextValueStack: any[] = [];

// 入栈，赋值给 context
export function pushProvider<T>(context: ReactContext<T>, newValue: T) {
	// 入栈上次的值
	prevContextValueStack.push(prevContextValue);
	// 旧值保存为上次值
	prevContextValue = context._currentValue;
	// 赋值新值
	context._currentValue = newValue;
}

// 出栈
export function popProvider<T>(context: ReactContext<T>) {
	// 赋值上次的值，归的过程中需要恢复上次的值，让其他层级获取到正确的值
	context._currentValue = prevContextValue;
	// 出栈，获取到上一个值
	prevContextValue = prevContextValueStack.pop();
}

export function prepareToReadContext(wip: FiberNode, renderLane: Lane) {
	lastContextDep = null;

	const deps = wip.dependencies;
	if (deps !== null) {
		const firstContext = deps.firstContext;
		if (firstContext !== null) {
			if (includeSomeLanes(deps.lanes, renderLane)) {
				markWipReceivedUpdate();
			}
			deps.firstContext = null;
		}
	}
}

// 读取，从传入的 context 获取值
export function readContext<T>(
	consumer: FiberNode | null,
	context: ReactContext<T>
): T {
	if (consumer === null) {
		throw new Error('只能在函数组件中调用useContext');
	}
	// 获取到 context 的值
	const value = context._currentValue;

	// 建立 fiber -> context
	const contextItem: ContextItem<T> = {
		context,
		next: null,
		memoizedState: value
	};

	if (lastContextDep === null) {
		lastContextDep = contextItem;
		consumer.dependencies = {
			firstContext: contextItem,
			lanes: NoLanes
		};
	} else {
		lastContextDep = lastContextDep.next = contextItem;
	}

	// 返回值
	return value;
}

export function propagateContextChange<T>(
	wip: FiberNode,
	context: ReactContext<T>,
	renderLane: Lane
) {
	let fiber = wip.child;
	if (fiber !== null) {
		fiber.return = wip;
	}

	while (fiber !== null) {
		let nextFiber = null;
		const deps = fiber.dependencies;
		if (deps !== null) {
			nextFiber = fiber.child;

			let contextItem = deps.firstContext;
			while (contextItem !== null) {
				if (contextItem.context === context) {
					// 找到了
					fiber.lanes = mergeLanes(fiber.lanes, renderLane);
					const alternate = fiber.alternate;
					if (alternate !== null) {
						alternate.lanes = mergeLanes(alternate.lanes, renderLane);
					}
					// 往上
					scheduleContextWorkOnParentPath(fiber.return, wip, renderLane);
					deps.lanes = mergeLanes(deps.lanes, renderLane);
					break;
				}
				contextItem = contextItem.next;
			}
		} else if (fiber.tag === ContextProvider) {
			nextFiber = fiber.type === wip.type ? null : fiber.child;
		} else {
			nextFiber = fiber.child;
		}

		if (nextFiber !== null) {
			nextFiber.return = fiber;
		} else {
			// 到了叶子结点
			nextFiber = fiber;
			while (nextFiber !== null) {
				if (nextFiber === wip) {
					nextFiber = null;
					break;
				}
				const sibling = nextFiber.sibling;
				if (sibling !== null) {
					sibling.return = nextFiber.return;
					nextFiber = sibling;
					break;
				}
				nextFiber = nextFiber.return;
			}
		}
		fiber = nextFiber;
	}
}

function scheduleContextWorkOnParentPath(
	from: FiberNode | null,
	to: FiberNode,
	renderLane: Lane
) {
	let node = from;

	while (node !== null) {
		const alternate = node.alternate;

		if (!isSubsetOfLanes(node.childLanes, renderLane)) {
			node.childLanes = mergeLanes(node.childLanes, renderLane);
			if (alternate !== null) {
				alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
			}
		} else if (
			alternate !== null &&
			!isSubsetOfLanes(alternate.childLanes, renderLane)
		) {
			alternate.childLanes = mergeLanes(alternate.childLanes, renderLane);
		}

		if (node === to) {
			break;
		}
		node = node.return;
	}
}
