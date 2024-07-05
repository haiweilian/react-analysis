// 引入最小堆封装代码
import { push, pop, peek } from './ScheduleMinHeap.js';

// 浏览器提供的 API，获取从 time origin（当前文档生命周期的开始节点时间） 之后到当前调用时经过的时间，它以一个恒定的速率慢慢增加的，不会受到系统时间的影响，具体参考：https://juejin.cn/post/7171633315336683528
let getCurrentTime = () => performance.now();

// Scheduler 优先级划分，数字越小优先级越高，0 表示没有优先级
const NoPriority = 0;
const ImmediatePriority = 1;
const UserBlockingPriority = 2;
const NormalPriority = 3;
const LowPriority = 4;
const IdlePriority = 5;

// Scheduler 根据优先级设置的对应 timeout 时间，越小越紧急
// 在 React 中，任务是可以被打断的，但是任务不能一直被打断，所以要设置一个超时时间，过了这个时间就必须立刻执行
// timeout 就表示超时时间
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// 为什么是 1073741823，查看：https://juejin.cn/post/7171633315336683528
var IDLE_PRIORITY_TIMEOUT = 1073741823;

// 普通任务队列，它是一个最小堆结构，最小堆查看：https://juejin.cn/post/7168283003037155359
var taskQueue = [];
// 延时任务队列，它同样是一个最小堆结构
var timerQueue = [];
// taskId
var taskIdCounter = 1;

// 任务队列是否正在被遍历执行，workLoop 执行前为 true，执行完成后改为 false
var isPerformingWork = false;
// 是否有正在执行的 requestHostCallback，它会在 requestHostCallback 调用前设为 true，workLoop 执行前改为 false
var isHostCallbackScheduled = false;
// 是否有正在执行的 requestHostTimeout，它会在 requestHostTimeout 执行前设为 true，cancenlHostTimeout 和 handleTimeout 中设为 false
var isHostTimeoutScheduled = false;
// message loop 是否正在执行，它会在 schedulePerformWorkUntilDeadline 前设为 true，在任务队列执行完毕后设为 false
let isMessageLoopRunning = false;

// 记录 requestHostCallback 执行时传入的 callback 函数，也就是 flushWork
let scheduledHostCallback = null;
// 用于 cancelHostTimeout 取消 requestHostTimeout
let taskTimeoutID = -1;

// 记录当前正在执行的任务
var currentTask = null;
var currentPriorityLevel = NormalPriority;

// 这里是调度的开始
function unstable_scheduleCallback(priorityLevel, callback, options) {
	var currentTime = getCurrentTime();

	// 任务被安排调度的时间，相当于去银行时的点击排号机器的那个时间
	var startTime;
	if (typeof options === 'object' && options !== null) {
		var delay = options.delay;
		if (typeof delay === 'number' && delay > 0) {
			startTime = currentTime + delay;
		} else {
			startTime = currentTime;
		}
	} else {
		startTime = currentTime;
	}

	// 任务不能一直被打断，timeout 表示这个任务的超时时间
	var timeout;
	switch (priorityLevel) {
		case ImmediatePriority:
			timeout = IMMEDIATE_PRIORITY_TIMEOUT;
			break;
		case UserBlockingPriority:
			timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
			break;
		case IdlePriority:
			timeout = IDLE_PRIORITY_TIMEOUT;
			break;
		case LowPriority:
			timeout = LOW_PRIORITY_TIMEOUT;
			break;
		case NormalPriority:
		default:
			timeout = NORMAL_PRIORITY_TIMEOUT;
			break;
	}

	// 任务的过期时间 = 开始调度的时间 + 超时时间
	var expirationTime = startTime + timeout;

	// 这就是储存在任务队列（taskQueue 和 timerQueue）中的任务对象
	var newTask = {
		id: taskIdCounter++,
		callback,
		priorityLevel,
		startTime,
		expirationTime,
		sortIndex: -1
	};

	// 如果 startTime > currentTime，说明是延时任务，将其放到 timerQueue
	if (startTime > currentTime) {
		newTask.sortIndex = startTime;
		// 这个 push 是封装的最小堆 push 方法，将元素追加到数组后，它会再进行一个排序，保证最小值在数组的第一个
		push(timerQueue, newTask);
		// peek(taskQueue) 获取 taskQueue 的第一个任务，因为是最小堆结构，获取的是最紧急的任务
		// 这个逻辑是在 taskQueue 为空的情况下才会调用，这是因为 taskQueue 不为空的情况下，它会在每个任务执行的时候都会遍历一下 timerQueue，将到期的任务移到 taskQueue
		// newTask === peek(timerQueue) 表示新创建的任务就是最早的要安排调度的延时任务
		if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
			// 保证最多只有一个 requestHostTimeout 在执行
			if (isHostTimeoutScheduled) {
				cancelHostTimeout();
			} else {
				isHostTimeoutScheduled = true;
			}
			// requestHostTimeout 本质是一个 setTimeout，时间到后，执行 handleTimeout
			requestHostTimeout(handleTimeout, startTime - currentTime);
		}
	}
	// 如果是正常任务，将其放到 taskQueue
	else {
		newTask.sortIndex = expirationTime;
		push(taskQueue, newTask);
		// 如果没有正在执行的 requestHostCallback 并且任务队列也没有被执行
		if (!isHostCallbackScheduled && !isPerformingWork) {
			isHostCallbackScheduled = true;
			requestHostCallback(flushWork);
		}
	}

	return newTask;
}

// 你可以把这个函数理解为 requestIdleCallback，都实现了空闲时期执行代码
function requestHostCallback(callback) {
	// 将 callback 函数存为全局变量，传入的是 flushWork 这个函数
	scheduledHostCallback = callback;
	if (!isMessageLoopRunning) {
		isMessageLoopRunning = true;
		schedulePerformWorkUntilDeadline();
	}
}

const channel = new MessageChannel();
const port = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;
// 借助 Message Channel，让出线程，告诉浏览器登空闲了再执行任务队列
function schedulePerformWorkUntilDeadline() {
	port.postMessage(null);
}

// 批量任务的开始时间
// React 并不是每一个任务执行完都执行 schedulePerformWorkUntilDeadline 让出线程的，而是执行完一个任务，看看过了多久，如果时间不超过 5ms，那就再执行一个任务，等做完一个任务，发现过了 5ms，这才让出线程，所以 React 是一批一批任务执行的，startTime 记录的是这一批任务的开始时间，而不是单个任务的开始时间。
var startTime = -1;
function performWorkUntilDeadline() {
	// scheduledHostCallback 就是 flushWork 这个函数
	if (scheduledHostCallback !== null) {
		const currentTime = getCurrentTime();
		startTime = currentTime;
		const hasTimeRemaining = true;
		let hasMoreWork = true;
		try {
			hasMoreWork = scheduledHostCallback(hasTimeRemaining, currentTime);
		} finally {
			if (hasMoreWork) {
				// 如果在一个时间切片里没有完成所有任务，那就执行 schedulePerformWorkUntilDeadline，让出线程，等浏览器空闲了再继续执行
				schedulePerformWorkUntilDeadline();
			} else {
				isMessageLoopRunning = false;
				scheduledHostCallback = null;
			}
		}
	} else {
		isMessageLoopRunning = false;
	}
}

function flushWork(hasTimeRemaining, initialTime) {
	isHostCallbackScheduled = false;
	// 定时器的目的表面上是为了保证最早的延时任务准时安排调度，实际上是为了保证 timerQueue 中的任务都能被执行。定时器到期后，我们会执行 advanceTimers 和 flushWork，flushWork 中会执行 workLoop，workLoop 中会将 taskQueue 中的任务不断执行，当 taskQueue 执行完毕后，workLoop 会选择 timerQueue 中的最早的任务重新设置一个定时器。所以如果 flushWork 执行了，定时器也就没有必要了，所以可以取消了。
	if (isHostTimeoutScheduled) {
		isHostTimeoutScheduled = false;
		cancelHostTimeout();
	}

	isPerformingWork = true;
	const previousPriorityLevel = currentPriorityLevel;
	try {
		return workLoop(hasTimeRemaining, initialTime);
	} finally {
		currentTask = null;
		currentPriorityLevel = previousPriorityLevel;
		isPerformingWork = false;
	}
}

// 遍历 taskQueue，执行任务
function workLoop(hasTimeRemaining, initialTime) {
	console.log('workLoop start');
	let currentTime = initialTime;
	// 检查 timerQueue 中的任务，将到期的任务转到 taskQueue 中
	advanceTimers(currentTime);
	currentTask = peek(taskQueue);
	while (currentTask !== null) {
		// 如果任务还没有到过期时间并且 shouldYieldToHost 返回 true
		if (currentTask.expirationTime > currentTime && shouldYieldToHost()) {
			break;
		}
		// 获取任务执行函数
		const callback = currentTask.callback;
		if (typeof callback === 'function') {
			currentTask.callback = null;
			currentPriorityLevel = currentTask.priorityLevel;
			// 该任务执行的时候是否已经过期
			const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
			// 任务函数执行
			const continuationCallback = callback(didUserCallbackTimeout);
			currentTime = getCurrentTime();
			// React 中单个任务在执行的时候，也是可以被打断的，如果单个任务执行的时候被打断，会返回一个函数
			// 这个任务被打断了
			if (typeof continuationCallback === 'function') {
				currentTask.callback = continuationCallback;
			}
			// 这个任务执行完毕
			else {
				if (currentTask === peek(taskQueue)) {
					pop(taskQueue);
				}
			}
			// 检查任务队列
			advanceTimers(currentTime);
		}
		// 说明任务执行完毕
		else {
			pop(taskQueue);
		}
		// 执行下一个任务
		currentTask = peek(taskQueue);
	}

	if (currentTask !== null) {
		return true;
	} else {
		// 如果 taskQueue 空了，timerQueue 中的最先执行的任务还没有到时间，那就执行一个 requestHostTimeout 定时器，保证准时执行
		const firstTimer = peek(timerQueue);
		if (firstTimer !== null) {
			requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
		}
		return false;
	}
}

// 检查 timerQueue 中的任务，将到期的任务转到 taskQueue 中
function advanceTimers(currentTime) {
	let timer = peek(timerQueue);
	while (timer !== null) {
		// 任务被取消了
		if (timer.callback === null) {
			pop(timerQueue);
		}
		// //任务到期就转到 taskQueue 中
		else if (timer.startTime <= currentTime) {
			pop(timerQueue);
			timer.sortIndex = timer.expirationTime;
			push(taskQueue, timer);
		} else {
			return;
		}
		timer = peek(timerQueue);
	}
}

// 默认时间切片为 5ms
let frameInterval = 5;

// 判断是否让出线程，主要看这批任务自开始过了多久，超过了切片时间，就让出线程
function shouldYieldToHost() {
	const timeElapsed = getCurrentTime() - startTime;
	if (timeElapsed < frameInterval) {
		return false;
	}

	return true;
}

function requestHostTimeout(callback, ms) {
	taskTimeoutID = setTimeout(() => {
		callback(getCurrentTime());
	}, ms);
}

function cancelHostTimeout() {
	clearTimeout(taskTimeoutID);
	taskTimeoutID = -1;
}

function handleTimeout(currentTime) {
	isHostTimeoutScheduled = false;
	advanceTimers(currentTime);

	if (!isHostCallbackScheduled) {
		if (peek(taskQueue) !== null) {
			isHostCallbackScheduled = true;
			requestHostCallback(flushWork);
		}
		// 延时任务可能被取消了
		else {
			const firstTimer = peek(timerQueue);
			if (firstTimer !== null) {
				requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
			}
		}
	}
}

export { unstable_scheduleCallback };
