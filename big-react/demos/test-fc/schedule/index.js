// https://juejin.cn/post/7171728961473347614
// REACT-并发更新 任务调度实现
import { unstable_scheduleCallback } from './Schedule';

// 模拟函数的执行
const sleep = (delay) => {
	for (let start = Date.now(); Date.now() - start <= delay; ) {}
};

unstable_scheduleCallback(3, () => {
	console.log(1);
});

unstable_scheduleCallback(
	3,
	() => {
		console.log(2);
		sleep(10);
	},
	{
		delay: 10
	}
);

unstable_scheduleCallback(
	3,
	() => {
		console.log(3);
	},
	{
		delay: 10
	}
);

unstable_scheduleCallback(3, () => {
	console.log(4);
	sleep(10);
});

unstable_scheduleCallback(3, () => {
	console.log(5);
});

unstable_scheduleCallback(1, () => {
	console.log(0);
});
