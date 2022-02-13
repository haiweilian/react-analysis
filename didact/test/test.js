function workLoop(deadline) {
  console.log(deadline)
}
requestIdleCallback(workLoop);
