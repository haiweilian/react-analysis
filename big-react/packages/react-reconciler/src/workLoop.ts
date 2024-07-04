import { scheduleMicroTask } from 'hostConfig';
import { beginWork } from './beginWork';
import commitHookEffectListDestroy, {
	commitHookEffectListCreate,
	commitHookEffectListUnmount,
	commitLayoutEffects,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	createWorkInProgress,
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects
} from './fiber';
import {
	HostEffectMask,
	MutationMask,
	NoFlags,
	PassiveMask
} from './fiberFlags';
import {
	getHighestPriorityLane,
	getNextLane,
	Lane,
	lanesToSchedulerPriority,
	markRootFinished,
	markRootSuspended,
	mergeLanes,
	NoLane,
	SyncLane
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';
import { throwException } from './fiberThrow';
import { SuspenseException, getSuspenseThenable } from './thenable';
import { unwindWork } from './fiberUnwindWork';
import { resetHooksOnUnwind } from './fiberHooks';

let workInProgress: FiberNode | null = null;
let wipRootRenderLane: Lane = NoLane;
let rootDoesHasPassiveEffects = false;

type RootExitStatus = number;
// 工作中的状态
const RootInProgress = 0;
// 并发中间状态
const RootInComplete = 1;
// 完成状态
const RootCompleted = 2;
// 未完成状态，不用进入commit阶段
const RootDidNotComplete = 3;
let workInProgressRootExitStatus: number = RootInProgress;

// Suspense
type SuspendedReason =
	| typeof NotSuspended
	| typeof SuspendedOnError
	| typeof SuspendedOnData
	| typeof SuspendedOnDeprecatedThrowPromise;
const NotSuspended = 0;
const SuspendedOnError = 1;
const SuspendedOnData = 2;
const SuspendedOnDeprecatedThrowPromise = 4;

let workInProgressSuspendedReason: SuspendedReason = NotSuspended;
let workInProgressThrownValue: any = null;

// 初始化工作中的fiber
function prepareFreshStack(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {}); // HostToot
	wipRootRenderLane = lane;

	workInProgressRootExitStatus = RootInProgress;
	workInProgressSuspendedReason = NotSuspended;
	workInProgressThrownValue = null;
}

// 调度执行
export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	// 找到根 FiberRootNode
	const root = markUpdateLaneFromFiberToRoot(fiber, lane);
	markRootUpdated(root, lane);
	ensureRootIsScheduled(root);
}

// schedule阶段入口
// 初始阶段可以不关注优先级的逻辑，只关注同步调度
export function ensureRootIsScheduled(root: FiberRootNode) {
	const updateLane = getNextLane(root);
	const existingCallback = root.callbackNode;

	if (updateLane === NoLane) {
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		root.callbackNode = null;
		root.callbackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callbackPriority;

	if (curPriority === prevPriority) {
		return;
	}

	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}
	let newCallbackNode = null;

	if (__DEV__) {
		console.log(
			`在${updateLane === SyncLane ? '微' : '宏'}任务中调度，优先级：`,
			updateLane
		);
	}

	if (updateLane === SyncLane) {
		// REACT-初始化-2.1调度同步任务
		// 同步优先级 用微任务调度
		// [performSyncWorkOnRoot, performSyncWorkOnRoot, performSyncWorkOnRoot]
		// 添加进同步队列 【performSyncWorkOnRoot 是渲染任务】
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root, updateLane));
		// 使用微任务调度执行
		scheduleMicroTask(flushSyncCallbacks);
	} else {
		// 其他优先级 用宏任务调度
		const schedulerPriority = lanesToSchedulerPriority(updateLane);

		newCallbackNode = scheduleCallback(
			schedulerPriority,
			// @ts-ignore
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}
	root.callbackNode = newCallbackNode;
	root.callbackPriority = curPriority;
}

export function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// 找到根 FiberRootNode
export function markUpdateLaneFromFiberToRoot(fiber: FiberNode, lane: Lane) {
	let node = fiber;
	let parent = node.return; // 一直往父级找
	while (parent !== null) {
		parent.childLanes = mergeLanes(parent.childLanes, lane);
		const alternate = parent.alternate;
		if (alternate !== null) {
			alternate.childLanes = mergeLanes(alternate.childLanes, lane);
		}

		node = parent;
		parent = node.return;
	}
	if (node.tag === HostRoot) {
		// HostRoot 的 stateNode 保存的是 FiberRootNode
		return node.stateNode;
	}
	return null;
}

function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	// 保证useEffect回调执行
	const curCallback = root.callbackNode;
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		if (root.callbackNode !== curCallback) {
			return null;
		}
	}

	const lane = getNextLane(root);
	const curCallbackNode = root.callbackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;
	// render阶段
	const exitStatus = renderRoot(root, lane, !needSync);

	switch (exitStatus) {
		// 中断
		case RootInComplete:
			if (root.callbackNode !== curCallbackNode) {
				return null;
			}
			return performConcurrentWorkOnRoot.bind(null, root);
		case RootCompleted:
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			root.finishedLane = lane;
			wipRootRenderLane = NoLane;
			commitRoot(root);
			break;
		case RootDidNotComplete:
			markRootSuspended(root, lane);
			wipRootRenderLane = NoLane;
			ensureRootIsScheduled(root);
			break;
		default:
			if (__DEV__) {
				console.error('还未实现的并发更新结束状态');
			}
	}
}

// REACT-初始化-3 同步执行渲染
function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getNextLane(root);

	if (nextLane !== SyncLane) {
		// 其他比SyncLane低的优先级
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}

	// 渲染
	const exitStatus = renderRoot(root, nextLane, false);

	switch (exitStatus) {
		case RootCompleted:
			const finishedWork = root.current.alternate;
			root.finishedWork = finishedWork;
			root.finishedLane = nextLane;
			wipRootRenderLane = NoLane;
			commitRoot(root);
			break;
		case RootDidNotComplete:
			wipRootRenderLane = NoLane;
			markRootSuspended(root, nextLane);
			ensureRootIsScheduled(root);
			break;
		default:
			if (__DEV__) {
				console.error('还未实现的同步更新结束状态');
			}
			break;
	}
}

let c = 0;

// REACT-初始化-3.1 从根节点开始渲染
function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`开始${shouldTimeSlice ? '并发' : '同步'}更新`, root);
	}

	if (wipRootRenderLane !== lane) {
		// 初始化
		prepareFreshStack(root, lane);
	}

	do {
		try {
			if (
				workInProgressSuspendedReason !== NotSuspended &&
				workInProgress !== null
			) {
				const thrownValue = workInProgressThrownValue;

				workInProgressSuspendedReason = NotSuspended;
				workInProgressThrownValue = null;

				throwAndUnwindWorkLoop(root, workInProgress, thrownValue, lane);
			}

			// 开启一个工作循环，递归处理每个 Fiber Node
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.warn('workLoop发生错误', e);
			}
			c++;
			if (c > 20) {
				break;
				console.warn('break!');
			}
			handleThrow(root, e);
		}
	} while (true);

	if (workInProgressRootExitStatus !== RootInProgress) {
		return workInProgressRootExitStatus;
	}

	// 中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}
	// render阶段执行完
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error(`render阶段结束时wip不应该不是null`);
	}
	return RootCompleted;
}

// REACT-初始化-6 提交 DomNode
// 这一阶段会把 DOM 添加到浏览器中显示
function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;

	if (finishedWork === null) {
		return;
	}

	if (__DEV__) {
		console.warn('commit阶段开始', finishedWork);
	}
	const lane = root.finishedLane;

	if (lane === NoLane && __DEV__) {
		console.error('commit阶段finishedLane不应该是NoLane');
	}

	// 重置
	root.finishedWork = null;
	root.finishedLane = NoLane;

	markRootFinished(root, lane);

	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		if (!rootDoesHasPassiveEffects) {
			rootDoesHasPassiveEffects = true;
			// 调度副作用
			scheduleCallback(NormalPriority, () => {
				// REACT-useEffect 3. 执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	// 判断是否存在3个子阶段需要执行的操作
	// root flags root subtreeFlags
	const subtreeHasEffect =
		(finishedWork.subtreeFlags & (MutationMask | PassiveMask)) !== NoFlags;
	const rootHasEffect =
		(finishedWork.flags & (MutationMask | PassiveMask)) !== NoFlags;

	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation Placement
		// REACT-初始化-6.1 提交变更
		commitMutationEffects(finishedWork, root);

		root.current = finishedWork;

		// 阶段3/3:Layout
		commitLayoutEffects(finishedWork, root);
	} else {
		root.current = finishedWork;
	}

	rootDoesHasPassiveEffects = false;
	ensureRootIsScheduled(root);
}

// 执行副作用
function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;
	// 组件卸载执行销毁函数
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	// 组件更新执行销毁函数
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});

	// 组件创建执行创建函数，创建函数执行后返回销毁函数
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

// 同步工作循环
function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

// REACT-初始化-4 构建 FiberNode
// 这一阶段会根据 ReactElement 创建 FiberNode，在 *递* 的过程中构建，从父到子
function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber, wipRootRenderLane);
	fiber.memoizedProps = fiber.pendingProps;

	if (next === null) {
		completeUnitOfWork(fiber);
	} else {
		workInProgress = next;
	}
}

// REACT-初始化-5 构建 DomNode
// 这一阶段会根据 FiberNode 创建 DomNode，在 *归* 的过程中构建，从子到父
function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;

	do {
		completeWork(node);
		const sibling = node.sibling;

		if (sibling !== null) {
			workInProgress = sibling;
			return;
		}
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}

function handleThrow(root: FiberRootNode, thrownValue: any): void {
	/*
		throw可能的情况
			1. use thenable
			2. error (Error Boundary处理)
	*/
	if (thrownValue === SuspenseException) {
		workInProgressSuspendedReason = SuspendedOnData;
		thrownValue = getSuspenseThenable();
	} else {
		const isWakeable =
			thrownValue !== null &&
			typeof thrownValue === 'object' &&
			typeof thrownValue.then === 'function';

		workInProgressThrownValue = thrownValue;
		workInProgressSuspendedReason = isWakeable
			? SuspendedOnDeprecatedThrowPromise
			: SuspendedOnError;
	}
	workInProgressThrownValue = thrownValue;
}

function throwAndUnwindWorkLoop(
	root: FiberRootNode,
	unitOfWork: FiberNode,
	thrownValue: any,
	lane: Lane
) {
	// unwind前的重置hook，避免 hook0 use hook1 时 use造成中断，再恢复时前后hook对应不上
	resetHooksOnUnwind(unitOfWork);
	throwException(root, thrownValue, lane);
	unwindUnitOfWork(unitOfWork);
}

function unwindUnitOfWork(unitOfWork: FiberNode) {
	let incompleteWork: FiberNode | null = unitOfWork;
	do {
		const next = unwindWork(incompleteWork);

		if (next !== null) {
			next.flags &= HostEffectMask;
			workInProgress = next;
			return;
		}

		const returnFiber = incompleteWork.return as FiberNode;
		if (returnFiber !== null) {
			returnFiber.deletions = null;
		}
		incompleteWork = returnFiber;
		// workInProgress = incompleteWork;
	} while (incompleteWork !== null);

	// 没有 边界 中止unwind流程，一直到root
	workInProgress = null;
	workInProgressRootExitStatus = RootDidNotComplete;
}
