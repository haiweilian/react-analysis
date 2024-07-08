import { REACT_CONTEXT_TYPE, REACT_PROVIDER_TYPE } from 'shared/ReactSymbols';
import { ReactContext } from 'shared/ReactTypes';

// REACT-Context 1.创建 Context
// const xx = createContext('deafult');
// <xx.Provider></xx.Provider>
export function createContext<T>(defaultValue: T): ReactContext<T> {
	// 创建 Context 组件
	const context: ReactContext<T> = {
		$$typeof: REACT_CONTEXT_TYPE,
		Provider: null,
		_currentValue: defaultValue
	};
	// 创建 Provider 组件
	context.Provider = {
		$$typeof: REACT_PROVIDER_TYPE,
		_context: context
	};
	return context;
}
