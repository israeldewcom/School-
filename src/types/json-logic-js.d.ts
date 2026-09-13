declare module 'json-logic-js' {
  export function apply(logic: any, data: any): any;
  export function add_operation(name: string, fn: (...args: any[]) => any): void;
  export function is_logic(value: any): boolean;
  export function truthy(value: any): boolean;
  const _default: {
    apply: typeof apply;
    add_operation: typeof add_operation;
    is_logic: typeof is_logic;
    truthy: typeof truthy;
  };
  export default _default;
}
