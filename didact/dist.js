/**
 * JSX 通过 babel 编译后就是调用 createElement
 * @param {*} type 节点类型 div, span, ...
 * @param {*} props 节点属性 id, class, ...
 * @param  {...any} children 子节点
 * @returns
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: { ...props,
      children: children.map(child => {
        // 判断子节点类型
        return typeof child === "object" ? child : createTextElement(child);
      })
    }
  };
}
/**
 * 子节点除了标签之外的文本类型的节点
 * @param {*} text 文本类型
 * @returns
 */


function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    // 用一个 TEXT_ELEMENT 特殊来标记
    props: {
      nodeValue: text,
      children: []
    }
  };
}
/**
 * 创建 dom
 * @returns
 */
// fiber 就是一个增强的虚拟 dom 节点。这里通过 fiber 创建一个真实的 dom 节点


function createDom(fiber) {
  // 如果是文本类型使用 createTextNode，元素节点使用 createElement
  const dom = fiber.type === "TEXT_ELEMENT" ? document.createTextNode("") : document.createElement(fiber.type); // 默认绑定属性和事件

  updateDom(dom, {}, fiber.props);
  return dom;
}
/**
 * 更新 dom
 * @returns
 */


const isEvent = key => key.startsWith("on"); // on 开头的为事件


const isProperty = key => key !== "children" && !isEvent(key); // children 和 onXxx 不为属性


const isNew = (prev, next) => key => prev[key] !== next[key]; // 属性值不相等则为新属性


const isGone = (prev, next) => key => !(key in next); // key 不在新属性中则该移除


function updateDom(dom, prevProps, nextProps) {
  // 对事件的处理
  // 旧的事件不在新属性中，或者同名事件的值不相等，则移除该事件
  Object.keys(prevProps).filter(isEvent).filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key)).forEach(name => {
    const eventType = name.toLowerCase().substring(2);
    dom.removeEventListener(eventType, prevProps[name]);
  }); // 添加新事件

  Object.keys(nextProps).filter(isEvent).filter(isNew(prevProps, nextProps)).forEach(name => {
    const eventType = name.toLowerCase().substring(2);
    dom.addEventListener(eventType, nextProps[name]);
  }); // 对普通属性的处理
  // 旧属性不在新属性中，则移除

  Object.keys(prevProps).filter(isProperty).filter(isGone(prevProps, nextProps)).forEach(name => {
    dom[name] = "";
  }); // 旧属性的 key 值与新属性不同，则修改/添加

  Object.keys(nextProps).filter(isProperty).filter(isNew(prevProps, nextProps)).forEach(name => {
    dom[name] = nextProps[name];
  });
}
/**
 * 调度器的实现，一块一块的构建
 */
// 一旦开始进行构建虚拟 dom 进行渲染，这过程中构建虚拟 dom 可能会耗费很多时间，出现性能问题。所以需要将构建任务分成一些小块（即 fiber），
// 每当完成其中一块任务后，就把控制权交给浏览器，让浏览器判断是否有更高优先级的任务需要完成。


let nextUnitOfWork = null; // 下一次构建的 fiber 树

let wipRoot = null; // 一棵树用来记录对 DOM 节点的修改，用于一次性提交进行 DOM 的修改。

let currentRoot = null; // 保存上次提交到 DOM 节点的 fiber 树的引用，用于对虚拟 DOM 进行比较

let deletions = []; // 需要移除的 fiber 数组

function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) return; // 父 fiber 是函数组件生成的 fiber 则没有 dom，需要一直往上找到有 dom 的 fiber 节点，
  // 再在这个父 fiber 的 dom 中对当前 fiber 进行更改操作

  let hasDomParentFiber = fiber.parent;

  while (!hasDomParentFiber.dom) {
    hasDomParentFiber = hasDomParentFiber.parent;
  }

  const domParent = hasDomParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
} // 移除节点需要移除该 fiber 下第一个有 dom 节点的 fiber 节点。
// （添加节点调用 appendChild，即使没有 dom 也无所谓，可以不处理。更新节点是更新属性，也不需要真实的 dom 节点。当然按理也是需要处理的）


function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    commitDeletion(fiber.child, domParent);
  }
}

function workLoop(deadline) {
  let shouldYield = false; // 每次 while 循环构建一个 fiber，被中断后可以回来继续构建

  while (nextUnitOfWork && !shouldYield) {
    // 构建当前 fiber，返回下一个待构建的 fiber
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork); // deadline.timeRemaining() 返回当前闲置周期的预估剩余毫秒数。小于1则说明没有时间了，停止 while 循环终止 fiber 的构建

    shouldYield = deadline.timeRemaining() < 1;
  } // 一次性全部提交 dom 的修改


  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
} // requestIdleCallback 浏览器内置方法！！！有兼容问题，react 是自己实现的 scheduler，原理相通。
// requestIdleCallback 类似 setTimeout，只不过这次是浏览器来决定什么时候运行回调函数，而不是 setTimeout 里通过我们指定的一个时间。
// 浏览器会在主线程有空闲的时候运行回调函数。
// requestIdleCallback 会给我们一个 deadline 参数。我们可以通过它来判断离浏览器再次拿回控制权还有多少时间。


requestIdleCallback(workLoop); // 构建 fiber，并返回下一个 fiber。
// 在构建 fiber 的时候至少会完成当前 fiber 的构建，所以我们返回下一个待构建的 fiber 存储下来，当中断的时候就可以继续从下一个 fiber 开始。

function performUnitOfWork(fiber) {
  // 函数组件和基础组件不同，基础组件就是一个基本的 dom 元素，而函数组件需要通过运算后获得
  const isFunctionComponent = fiber.type instanceof Function;

  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  } // 返回下一个 fiber
  // 先查找子节点，如果存在子节点，返回子节点


  if (fiber.child) {
    return fiber.child;
  }

  let nextFiber = fiber;

  while (nextFiber) {
    // 如果兄弟节点存在
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    } // 不存在兄弟节点，继续查找父节点的兄弟节点


    nextFiber = nextFiber.parent;
  }
} // 提供给 hooks 使用的变量


let wipFiber = null; // 当前执行的 fiber

let hookIndex = null; // 当前执行的 hook 索引
// 更新函数组件

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = []; // useState 可以多次调用，需要使用一个数组来维护
  // fiber.type 获取到函数并执行，返回 return 的基础组件虚拟 dom（类组件则应该实例化后调用 render 方法）。fiber.props 是函数组件接收的属性。

  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function updateHostComponent(fiber) {
  // 如果没有构建 dom 元素，使用虚拟 dom 构建
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  let elements = fiber.props.children;
  reconcileChildren(fiber, elements);
}
/**
 * 协调器：比较新旧虚拟 DOM 构建 fiber 树
 * @param {*} wipFiber
 * @param {*} elements
 */


function reconcileChildren(wipFiber, elements) {
  // 创建新的子节点的 fiber，结构类似如下
  // <div>
  //   <h1></h1>
  //   <h2></h2>
  // </div>
  // {
  //   type: 'div'
  //   child: {
  //     type: 'h1',
  //     parent: 'div'
  //     sibling: {
  //       type: 'h2',
  //       parent: 'div'
  //     }
  //   }
  // }
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = 0;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null; // const newFiber = {
    //     type: oldFiber.type,  // 节点类型
    //     props: element.props,  // 节点属性
    //     parent: wipFiber,  // 每个子节点的 parent 指向当前 fiber
    //     dom: oldFiber.dom,  // 关联的 dom 元素
    //     alternate: oldFiber,  // 旧 fiber 节点的引用
    //     effectTag: 'UPDATE',  // DOM 修改类型
    // }
    // 判断是否是相同节点，在真实 diff 算法中还会根据 key 来判断排序是否变化

    const sameType = oldFiber && element && element.type === oldFiber.type; // 如果 old fiber 和 react element 都拥有相同的type（dom节点相同），我们只需要更新它的属性。

    if (sameType) {
      // TODO update the node
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE"
      };
    } // 如果 type 不同说明这里替换成了新的 dom 节点，我们需要创建。


    if (element && !sameType) {
      // TODO add this node
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT"
      };
    } // 如果 type 不同 且同级仅存在 old fiber 说明节点老节点删除了，我们需要移除老的节点。
    // 由于删除的时候我们不需要创建新节点，所以把需要删除单独存起来


    if (oldFiber && !sameType) {
      // TODO delete the oldFiber's node
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    } // 根据是否为第一个节点，添加到对应的 child / sibling 上面


    if (index === 0) {
      wipFiber.child = newFiber;
    } else {
      // 之后节点是上个节点的 sibling 节点
      prevSibling.sibling = newFiber;
    } // 保存为上一个节点


    prevSibling = newFiber;
    index++;
  }
}
/**
 * 渲染 DOM 元素
 * @param {*} element react 节点
 * @param {*} container 节点容器
 */


function render(element, container) {
  // 设置 nextUnitOfWork 为 fiber root 节点，当浏览器空闲的时候就会调用 workLoop 函数
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    child: null,
    parent: null,
    sibling: null,
    // 上次更新的fiber节点
    alternate: currentRoot
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}
/**
 * Hooks
 */
// 初始化值，每次函数组件执行的时候，没旧 hook 则获取初始值；有旧 hook 则获取旧 hook 上的值


function useState(initial) {
  // 获取当前 fiber 对应的旧 fiber 上的旧 hook
  const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    // 旧 hook 存在，则将旧 hook 的值复制给新 hook，否则初始化值
    queue: [] // 存储 setState 调用时传入的函数。setState 可以连续多次调用，所以使用队列保存

  }; // setState 被调用的时候并不会立即执行，而是将接收到的 action 保存在当前 hook 的 queue 中。待下次渲染的时候再执行

  const setState = action => {
    hook.queue.push(action); // 设置新的 wipRoot 重新渲染

    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  }; // 当组件每次渲染的时候就会按流程执行 useState，然后会执行对应 hook 中的所有 action


  const actions = oldHook ? oldHook.queue : [];
  actions.forEach(action => {
    hook.state = action(hook.state);
  }); // 将 hook 添加到 wipFiber.hooks

  wipFiber.hooks.push(hook); // hook 索引加1，多次执行 useState 的时候就是对下一个索引进行操作
  // 函数组件执行的时候 useState 也是按顺序执行的，每个 useState 对应执行顺序的索引

  hookIndex++;
  return [hook.state, setState];
}

const Didact = {
  createElement,
  render,
  useState
}; // Babel: https://babeljs.io/repl#?browsers=&build=&builtIns=false&corejs=3.6&spec=false&loose=false&code_lz=PQKhAIAECsGcA9wBECWATAhgYwC4DosAnAUwx2IFEAbYgW2IDsdwRgAoLAewdmeJvpNwAXnAAKNuHAAeNCgBu4dMIBEAM06cVAPklSZGbQCMMhacEN6p0o-GC7rwOfN0BKDt17guTDCgbEhCLgaJxYAK6C-ADmxDjUdIw4AEIAngCSaGIqhJo4Ku4ASqS4SADyALJ4JAxogWL8iUwANN7cOH4BhO5AA&debug=false&forceAllTransforms=false&shippedProposals=false&circleciRepo=&evaluate=false&fileSize=false&timeTravel=false&sourceType=module&lineWrap=true&presets=react&prettier=false&targets=&version=7.17.2&externalPlugins=&assumptions=%7B%7D
// 告诉编译器使用 Didact.createElement 代替 React.createElement

/** @jsx Didact.createElement */

const App = props => {
  const [state, setState] = Didact.useState(1);
  return Didact.createElement("div", {
    style: "background: salmon"
  }, Didact.createElement("h1", {
    onClick: () => setState(c => c + 1)
  }, "Count: ", state), Didact.createElement("h1", null, props.hello), Didact.createElement("h2", {
    style: "text-align:right"
  }, "from Didact"));
};

const container = document.getElementById("root");
Didact.render(Didact.createElement(App, {
  hello: "Hello World"
}), container);
