import { Dispatch } from 'react/src/currentDispatcher';
import { Dispatcher } from 'react/src/currentDispatcher';
import internals from 'shared/internals';
import { Action, ReactContext, Thenable, Usable } from 'shared/ReactTypes';
import { FiberNode } from './fiber';
import { Flags, PassiveEffect } from './fiberFlags';
import {
	Lane,
	NoLane,
	NoLanes,
	mergeLanes,
	removeLanes,
	requestUpdateLane
} from './fiberLanes';
import { HookHasEffect, Passive } from './hookEffectTags';
import {
	basicStateReducer,
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	Update,
	UpdateQueue
} from './updateQueue';
import { scheduleUpdateOnFiber } from './workLoop';
import { trackUsedThenable } from './thenable';
import { REACT_CONTEXT_TYPE } from 'shared/ReactSymbols';
import { markWipReceivedUpdate } from './beginWork';
import { readContext as readContextOrigin } from './fiberContext';

let currentlyRenderingFiber: FiberNode | null = null;
let workInProgressHook: Hook | null = null;
let currentHook: Hook | null = null;
let renderLane: Lane = NoLane;

const { currentDispatcher, currentBatchConfig } = internals;

// REACT-Context 5. 读取 Context 值
function readContext<Value>(context: ReactContext<Value>): Value {
	const consumer = currentlyRenderingFiber as FiberNode;
	return readContextOrigin(consumer, context);
}
interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
	baseState: any;
	baseQueue: Update<any> | null;
}

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	deps: HookDeps;
	next: Effect | null;
}

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
	lastRenderedState: State;
}

type EffectCallback = () => void;
export type HookDeps = any[] | null;

export function renderWithHooks(
	wip: FiberNode,
	Component: FiberNode['type'],
	lane: Lane
) {
	// 赋值操作
	currentlyRenderingFiber = wip;
	// 重置 hooks链表
	wip.memoizedState = null;
	// 重置 effect链表
	wip.updateQueue = null;
	renderLane = lane;

	const current = wip.alternate;

	// REACT-Hooks 3.挂载Hooks函数
	// 在执行函数组件时，根据初始还是更新存储不同的 hooks 函数，
	// 我们实际使用 hooks 时，实际也就是执行内部的函数，它们会执行并保存状态。
	if (current !== null) {
		// update
		currentDispatcher.current = HooksDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HooksDispatcherOnMount;
	}

	const props = wip.pendingProps;
	// FC render
	// REACT-初始化-4.2.1 执行 FunctionComponent
	const children = Component(props);

	// 重置操作
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;
	return children;
}

const HooksDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext,
	use,
	useMemo: mountMemo,
	useCallback: mountCallback
};

const HooksDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext,
	use,
	useMemo: updateMemo,
	useCallback: updateCallback
};

// REACT-useEffect 1.mountEffect 存储 useEffect
// 存储的 useEffect 并不是直接执行了，而是需要在提交阶段判断是否需要执行和销毁
function mountEffect(create: EffectCallback | void, deps: HookDeps | void) {
	// 找到当前useEffect对应的hook数据
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;

	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

// REACT-useEffect 4. updateEffect
function updateEffect(create: EffectCallback | void, deps: HookDeps | void) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	let destroy: EffectCallback | void;

	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			// 浅比较依赖相等，不重新执行
			const prevDeps = prevEffect.deps;
			if (areHookInputsEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较 不相等，重新执行
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

function areHookInputsEqual(nextDeps: HookDeps, prevDeps: HookDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(prevDeps[i], nextDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

// 添加 useEffect
function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: HookDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	// 如果是第一个 useEffect 额外存储在 updateQueue 上
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 插入effect，形成环形链表，lastEffect.next 就是第一个 useEffect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}

function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

// REACT-useState 2.updateState
function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();

	// 计算新state的逻辑
	const queue = hook.updateQueue as FCUpdateQueue<State>;
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;

	if (pending !== null) {
		// pending baseQueue update保存在current中
		if (baseQueue !== null) {
			// baseQueue b2 -> b0 -> b1 -> b2
			// pendingQueue p2 -> p0 -> p1 -> p2
			// b0
			const baseFirst = baseQueue.next;
			// p0
			const pendingFirst = pending.next;
			// b2 -> p0
			baseQueue.next = pendingFirst;
			// p2 -> b0
			pending.next = baseFirst;
			// p2 -> b0 -> b1 -> b2 -> p0 -> p1 -> p2
		}
		baseQueue = pending;
		// 保存在current中
		current.baseQueue = pending;
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
		const prevState = hook.memoizedState;
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(baseState, baseQueue, renderLane, (update) => {
			const skippedLane = update.lane;
			const fiber = currentlyRenderingFiber as FiberNode;
			// NoLanes
			fiber.lanes = mergeLanes(fiber.lanes, skippedLane);
		});

		// NaN === NaN // false
		// Object.is true

		// +0 === -0 // true
		// Object.is false
		if (!Object.is(prevState, memoizedState)) {
			markWipReceivedUpdate();
		}

		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;

		queue.lastRenderedState = memoizedState;
	}

	// 返回新值和更新函数
	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

// 在更新阶段取 hooks 也是按链表一个一个取的，这也就是 hook 为什么只能在组件和组件顶层使用
function updateWorkInProgressHook(): Hook {
	// TODO render阶段触发的更新
	let nextCurrentHook: Hook | null;

	if (currentHook === null) {
		// 这是这个FC update时的第一个hook
		const current = (currentlyRenderingFiber as FiberNode).alternate;
		if (current !== null) {
			nextCurrentHook = current.memoizedState;
		} else {
			// mount
			nextCurrentHook = null;
		}
	} else {
		// 这个FC update时 后续的hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		// mount/update u1 u2 u3
		// update       u1 u2 u3 u4
		throw new Error(
			`组件 ${currentlyRenderingFiber?.type.name} 本次执行时的Hook比上次执行时多`
		);
	}

	currentHook = nextCurrentHook as Hook;
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		updateQueue: currentHook.updateQueue,
		next: null,
		baseQueue: currentHook.baseQueue,
		baseState: currentHook.baseState
	};
	if (workInProgressHook === null) {
		// mount时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时 后续的hook
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}
	return workInProgressHook;
}

// REACT-useState 1.mountState
// [num, dispatch] = useState(0) 当 useState 时实际返回了一个数组，包含初始值和更新函数
function mountState<State>(
	initialState: (() => State) | State
): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();
	// 初始值是否是函数，函数则立即执行
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	// 创建一个更新队列，更新 hooks 会从中取值
	const queue = createFCUpdateQueue<State>();
	hook.updateQueue = queue;
	hook.memoizedState = memoizedState;
	hook.baseState = memoizedState;

	// 返回一个用于修改 hook 值的函数
	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;
	queue.lastRenderedState = memoizedState;
	// 返回初始值和更新函数
	return [memoizedState, dispatch];
}

// REACT-useTransition 1.mountTransition
function mountTransition(): [boolean, (callback: () => void) => void] {
	// 加载状态
	const [isPending, setPending] = mountState(false);
	// 获取当前 hooks
	const hook = mountWorkInProgressHook();
	// 执行函数
	const start = startTransition.bind(null, setPending);
	hook.memoizedState = start;
	return [isPending, start];
}

// REACT-useTransition 2.updateTransition
function updateTransition(): [boolean, (callback: () => void) => void] {
	// 加载状态
	const [isPending] = updateState();
	// 获取当前 hooks
	const hook = updateWorkInProgressHook();
	const start = hook.memoizedState;
	return [isPending as boolean, start];
}

// REACT-useRef 1.mountRef
function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	// 存储值
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}

// REACT-useRef 2.updateRef
function updateRef<T>(initialValue: T): { current: T } {
	const hook = updateWorkInProgressHook();
	// 取值返回
	return hook.memoizedState;
}

// REACT-useTransition 3.startTransition 执行
function startTransition(setPending: Dispatch<boolean>, callback: () => void) {
	// 同步改变状态
	setPending(true);
	const prevTransition = currentBatchConfig.transition;
	// 修改 startTransition 执行时的优先级
	currentBatchConfig.transition = 1;

	// 执行回调，此时优先级已经改变
	callback();
	setPending(false);

	// 恢复优先级
	currentBatchConfig.transition = prevTransition;
}

// REACT-useState 1.2 触发更新
// 当调用 dispath 时，触发更新会从新调用 scheduleUpdateOnFiber 调度更新
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: FCUpdateQueue<State>,
	action: Action<State>
) {
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);

	// eager策略
	const current = fiber.alternate;
	if (
		fiber.lanes === NoLanes &&
		(current === null || current.lanes === NoLanes)
	) {
		// 当前产生的update是这个fiber的第一个update
		// 1. 更新前的状态 2.计算状态的方法
		const currentState = updateQueue.lastRenderedState;
		const eagerState = basicStateReducer(currentState, action);
		update.hasEagerState = true;
		update.eagerState = eagerState;

		if (Object.is(currentState, eagerState)) {
			enqueueUpdate(updateQueue, update, fiber, NoLane);
			// 命中eagerState
			if (__DEV__) {
				console.warn('命中eagerState', fiber);
			}
			return;
		}
	}

	enqueueUpdate(updateQueue, update, fiber, lane);

	scheduleUpdateOnFiber(fiber, lane);
}

// 挂载时会创建一个 hook，如果有多个会形成链表，并挂载当前组件 fiberNode 上，这也就是 hook 为什么只能在组件和组件顶层使用
function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		updateQueue: null,
		next: null,
		baseQueue: null,
		baseState: null
	};
	if (workInProgressHook === null) {
		// mount时 第一个hook
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时 后续的hook
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}
	return workInProgressHook;
}

function use<T>(usable: Usable<T>): T {
	if (usable !== null && typeof usable === 'object') {
		if (typeof (usable as Thenable<T>).then === 'function') {
			const thenable = usable as Thenable<T>;
			return trackUsedThenable(thenable);
		} else if ((usable as ReactContext<T>).$$typeof === REACT_CONTEXT_TYPE) {
			const context = usable as ReactContext<T>;
			return readContext(context);
		}
	}
	throw new Error('不支持的use参数 ' + usable);
}

export function resetHooksOnUnwind(wip: FiberNode) {
	currentlyRenderingFiber = null;
	currentHook = null;
	workInProgressHook = null;
}

export function bailoutHook(wip: FiberNode, renderLane: Lane) {
	const current = wip.alternate as FiberNode;
	wip.updateQueue = current.updateQueue;
	wip.flags &= ~PassiveEffect;

	current.lanes = removeLanes(current.lanes, renderLane);
}

// REACT-useCallback 1.mountCallback
function mountCallback<T>(callback: T, deps: HookDeps | undefined) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	// 把回调和依赖存储
	hook.memoizedState = [callback, nextDeps];
	return callback;
}

// REACT-useCallback 2.updateCallback
function updateCallback<T>(callback: T, deps: HookDeps | undefined) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const prevState = hook.memoizedState;

	// 如果依赖不变，直接返回存储的 callback
	if (nextDeps !== null) {
		const prevDeps = prevState[1];
		if (areHookInputsEqual(nextDeps, prevDeps)) {
			return prevState[0];
		}
	}
	hook.memoizedState = [callback, nextDeps];
	return callback;
}

// REACT-useMemo 1.mountMemo
function mountMemo<T>(nextCreate: () => T, deps: HookDeps | undefined) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	// 执行计算函数
	const nextValue = nextCreate();
	hook.memoizedState = [nextValue, nextDeps];
	return nextValue;
}

// REACT-useMemo 2.updateMemo
function updateMemo<T>(nextCreate: () => T, deps: HookDeps | undefined) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;
	const prevState = hook.memoizedState;

	// 如果依赖不变直接返回存储的结果
	if (nextDeps !== null) {
		const prevDeps = prevState[1];
		if (areHookInputsEqual(nextDeps, prevDeps)) {
			return prevState[0];
		}
	}

	// 反之重新执行
	const nextValue = nextCreate();
	hook.memoizedState = [nextValue, nextDeps];
	return nextValue;
}
