// 源码地址：https://github.com/facebook/react/blob/main/packages/scheduler/src/SchedulerMinHeap.js

export function push(heap, node) {
	const index = heap.length;
	heap.push(node);

	siftUp(heap, node, index);
}

export function peek(heap) {
	return heap.length === 0 ? null : heap[0];
}

export function pop(heap) {
	if (heap.length === 0) {
		return null;
	}
	const first = heap[0];
	// JavaScript 的 pop 方法删除并返回数组的最后一个元素
	const last = heap.pop();
	if (last !== first) {
		heap[0] = last;
		siftDown(heap, last, 0);
	}
	return first;
}

function siftUp(heap, node, i) {
	let index = i;
	while (index > 0) {
		// 获取父节点的索引位置
		const parentIndex = (index - 1) >>> 1;
		const parent = heap[parentIndex];
		if (compare(parent, node) > 0) {
			// 如果父节点更大，就交换位置
			heap[parentIndex] = node;
			heap[index] = parent;
			index = parentIndex;
		} else {
			// 直到父节点更小，就退出
			return;
		}
	}
}

function siftDown(heap, node, i) {
	let index = i;
	const length = heap.length;
	const halfLength = length >>> 1;
	while (index < halfLength) {
		const leftIndex = (index + 1) * 2 - 1;
		const left = heap[leftIndex];
		const rightIndex = leftIndex + 1;
		const right = heap[rightIndex];

		// 如果 left 比 node 小
		if (compare(left, node) < 0) {
			// 如果 right 比 left 还小，说明 right 最小，right 与 node 交换
			if (rightIndex < length && compare(right, left) < 0) {
				heap[index] = right;
				heap[rightIndex] = node;
				index = rightIndex;
			}
			// 说明 left 最小，left 与 node 交换
			else {
				heap[index] = left;
				heap[leftIndex] = node;
				index = leftIndex;
			}
		}
		// 如果 left node 大，但 right 比 node 小，right 与 node 交换
		else if (rightIndex < length && compare(right, node) < 0) {
			heap[index] = right;
			heap[rightIndex] = node;
			index = rightIndex;
		} else {
			// 子元素都比 node 大
			return;
		}
	}
}

function compare(a, b) {
	// 首先比较 sortIndex，其次是 id
	const diff = a.sortIndex - b.sortIndex;
	return diff !== 0 ? diff : a.id - b.id;
}
