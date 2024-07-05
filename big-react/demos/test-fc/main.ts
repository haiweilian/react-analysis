// REACT-并发更新 模拟实现演示

import {
	unstable_ImmediatePriority as ImmediatePriority,
	unstable_UserBlockingPriority as UserBlockingPriority,
	unstable_NormalPriority as NormalPriority,
	unstable_LowPriority as LowPriority,
	unstable_IdlePriority as IdlePriority,
	unstable_scheduleCallback as scheduleCallback,
	unstable_shouldYield as shouldYield,
	CallbackNode,
	unstable_getFirstCallbackNode as getFirstCallbackNode,
	unstable_cancelCallback as cancelCallback
} from 'scheduler';

import './style.css';
const button = document.querySelector('button');
const root = document.querySelector('#root');

// 数字越低优先级越高
type Priority =
	| typeof IdlePriority
	| typeof LowPriority
	| typeof NormalPriority
	| typeof UserBlockingPriority
	| typeof ImmediatePriority;

interface Work {
	count: number;
	priority: Priority;
}

const workList: Work[] = [];
let prevPriority: Priority = IdlePriority;
let curCallback: CallbackNode | null = null;

// 创建不同优先级的按钮
[LowPriority, NormalPriority, UserBlockingPriority, ImmediatePriority].forEach(
	(priority) => {
		const btn = document.createElement('button');
		root?.appendChild(btn);
		btn.innerText = [
			'',
			'ImmediatePriority',
			'UserBlockingPriority',
			'NormalPriority',
			'LowPriority'
		][priority];
		// 点击事件后开始渲染
		btn.onclick = () => {
			workList.unshift({
				count: 100,
				priority: priority as Priority
			});
			schedule();
		};
	}
);

// 工作过程仅有一个work如果仅有一个work，
// Scheduler有个优化路径:如果调度的回调函数的返回值是函数，则会继续调度返回的函数。

// 工作过程中产生相同优先级的work
// 如果优先级相同，则不需要开启新的调度。

// 工作过程中产生更高/低优先级的work把握一个原则:
// 我们每次选出的都是优先级最高的work。

function schedule() {
	// 获取第一个执行的任务
	const cbNode = getFirstCallbackNode();
	// 获取到最高优先级的任务
	const curWork = workList.sort((w1, w2) => w1.priority - w2.priority)[0];

	// 策略逻辑
	if (!curWork) {
		curCallback = null;
		cbNode && cancelCallback(cbNode);
		return;
	}

	// 获取当前任务的优先级，如果当前任务优先级和之前任务优先级相同，则继续执行之前的任务
	const { priority: curPriority } = curWork;
	if (curPriority === prevPriority) {
		return;
	}

	// 如果遇到优先级更高的，则取消回调的执行
	// 为什么说这个是更高而不是不同呢？因为新添加的优先级低的话是往后排的。
	cbNode && cancelCallback(cbNode);

	// 传入当前优先级调度执行
	curCallback = scheduleCallback(curPriority, perform.bind(null, curWork));
}

/**
 * scheduleCallback 执行会传入参数
 * @param work 当前任务
 * @param didTimeout 任务是否等待超时(饥饿问题)
 * @returns
 */
function perform(work: Work, didTimeout?: boolean) {
	/**
	 * 1. work.priority
	 * 2. 饥饿问题
	 * 3. 时间切片
	 */
	// 如果任务优先级是 ImmediatePriority 或者任务等待超时，则需要立即执行
	// shouldYield 时间是否用尽
	const needSync = work.priority === ImmediatePriority || didTimeout;
	while ((needSync || !shouldYield()) && work.count) {
		work.count--;
		insertSpan(work.priority + '');
	}

	// 中断执行 || 执行完
	prevPriority = work.priority;

	// 如果执行完从任务中删除
	if (!work.count) {
		const workIndex = workList.indexOf(work);
		workList.splice(workIndex, 1);
		prevPriority = IdlePriority;
	}

	// 记录两次 callback
	// 如果调用 schedule 后 callback 没有变化，证明两次优先级相等，则可以直接返回函数
	const prevCallback = curCallback;
	schedule();
	const newCallback = curCallback;

	if (newCallback && prevCallback === newCallback) {
		return perform.bind(null, work);
	}
}

function insertSpan(content) {
	const span = document.createElement('span');
	span.innerText = content;
	span.className = `pri-${content}`;
	doSomeBuzyWork(10000000);
	root?.appendChild(span);
}

function doSomeBuzyWork(len: number) {
	let result = 0;
	while (len--) {
		result += len;
	}
}
