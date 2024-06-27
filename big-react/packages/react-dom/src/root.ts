import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { ReactElementType } from 'shared/ReactTypes';
import { Container } from './hostConfig';
import { initEvent } from './SyntheticEvent';

// REACT-初始化-1.入口
// ReactDOM.createRoot(root)
export function createRoot(container: Container) {
	// 初始时创建根节点
	const root = createContainer(container);

	return {
		// root.render(<App/>)
		render(element: ReactElementType) {
			initEvent(container, 'click');
			return updateContainer(element, root);
		}
	};
}
