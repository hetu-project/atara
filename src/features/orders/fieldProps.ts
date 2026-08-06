import type { UseFormRegister } from 'react-hook-form';

/** 两组收款字段子组件共用的 prop 形状 */
export interface FieldGroupProps {
  register: UseFormRegister<any>;
  err: (name: string) => string | undefined;
}
