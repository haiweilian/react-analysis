let syncQueue: ((...args: any) => void)[] | null = null;
let isFlushingSyncQueue = false;

// 同步调度，添加进队列
export function scheduleSyncCallback(callback: (...args: any) => void) {
	if (syncQueue === null) {
		syncQueue = [callback];
	} else {
		syncQueue.push(callback);
	}
}

// 执行同步调度，指定队列中的任务
export function flushSyncCallbacks() {
	// 是否正在执行，正在执行则不重新执行
	if (!isFlushingSyncQueue && syncQueue) {
		isFlushingSyncQueue = true;
		try {
			syncQueue.forEach((callback) => callback());
		} catch (e) {
			if (__DEV__) {
				console.error('flushSyncCallbacks报错', e);
			}
		} finally {
			isFlushingSyncQueue = false;
			syncQueue = null;
		}
	}
}
