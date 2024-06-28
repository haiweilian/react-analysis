# React 大致流程

React 从根节点开始。

- begin 阶段 React 会根据 ReactElement 创建 FiberNode。
- complete 阶段 React 会根据 FiberNode 创建 DOM 节点。
- commit 阶段 React 会将 DOM 节点挂载到页面上。

当触发更新后，React 会从根节点重新执行(包含 bailout 策略？)

# Hooks 为什么不能在判断和循环中使用。

因为 React 实现 hooks 的方式是以链表形式存储的。
在 React 执行挂载组件时会执行 hook 函数并形成一条链表存储在当前组件上(Fiber.memoizedState)。
在 React 执行更新组件时再执行 hook 函数会从链表中依次获取对应的 hook 函数。那么在更新时必须以同样的顺序取链表的节点才能获取到正确的值。

# React 中的事件代理和合成事件。

事件代理： 
React 在根节点绑定事件，利用事件委托实现事件执行。在创建和更新 DOM 节点时把 props 存储在 node 节点上。监听根节点的事件，从触发源依次向父级查找收集事件。

合成事件： 
因为事件都是模拟的，为了能实现阻止事件传播，所有对事件对象的 e.stopPropagation() 做扩展，执行时添加一个表示阻止事件传播的标识。执行事件时会判断是否阻止事件传播，阻止则停止执行。
