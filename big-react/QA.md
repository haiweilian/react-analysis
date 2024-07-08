# React 大致流程

React 从根节点开始。

- begin 阶段 React 会根据 ReactElement 创建 FiberNode。
- complete 阶段 React 会根据 FiberNode 创建 DOM 节点。
- commit 阶段 React 会将 DOM 节点挂载到页面上。

当触发更新后，React 会从根节点重新执行(包含 bailout 策略？)

# Hooks 为什么不能在判断和循环中使用

因为 React 实现 hooks 的方式是以链表形式存储的。
在 React 执行挂载组件时会执行 hook 函数并形成一条链表存储在当前组件上(Fiber.memoizedState)。
在 React 执行更新组件时再执行 hook 函数会从链表中依次获取对应的 hook 函数。那么在更新时必须以同样的顺序取链表的节点才能获取到正确的值。

# React 中的事件代理和合成事件

事件代理：
React 在根节点绑定事件，利用事件委托实现事件执行。在创建和更新 DOM 节点时把 props 存储在 node 节点上。监听根节点的事件，从触发源依次向父级查找收集事件。

合成事件：
因为事件都是模拟的，为了能实现阻止事件传播，所有对事件对象的 e.stopPropagation() 做扩展，执行时添加一个表示阻止事件传播的标识。执行事件时会判断是否阻止事件传播，阻止则停止执行。

为什么需要合成事件：

- 抹平不同浏览器 API 的差异，更便于跨平台
- 事件合成可以处理兼容性问题
- 利用事件委托机制，支持动态绑定，简化了 DOM 事件处理逻辑，减少了内存开销
- React 16 正式版本之后引入 Fiber 架构，React 可以通过干预事件的优先级以优化用户的交互体验(`schedule.runWithPriority()`)

# React 时间切片和优先级执行

React 使用 Schedule 实现任务调度，提供了一些用于调度执行的方法，比如添加优先级任务回调、判断是否超时、判断是否还有空闲实现等。

中断和时间切片的实现(执行流程伪代码)：

```js
function scheduleUpdateOnFiber() {
	// 使用优先级调度
	scheduleCallback(priority, performConcurrentWorkOnRoot);
}

function performConcurrentWorkOnRoot() {
	// 如果未处理完，并且还有剩余时间，就一直处理
	while (workInProgress !== null && !shouldYield()) {
		// 执行操作
	}

	// 如果上面循环停止了，但还未处理完就是中断了，返回新的回调等待下次执行
	if (workInProgress !== null) {
		return performConcurrentWorkOnRoot;
	}
}
```

- 任务只会在 begin 和 complete 阶段被中断，commit 阶段不会中断。
- 当开始构建时会往调度器里添加回调，调度器会在空闲时执行回调。回调执行过程中会判断是否还有空闲时间，如果没有空闲时间则中断执行，继续添加下一个任务，调度器会在下一个空闲时继续调用，直到完毕。

# React useTransition 的原理和作用

useTransition 在不阻塞 UI 的情况下更新状态的 Hook.

实现原理：

在执行 startTransition 会标记状态，在获取优先级的时候会根据状态判断是否在 startTransition 中执行，使 在 startTransition 的更新都变成优先级比较低的并发更新。
