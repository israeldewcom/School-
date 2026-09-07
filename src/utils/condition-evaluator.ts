import jsonLogic from 'json-logic-js';

export const evaluateCondition = (condition: any, data: any): boolean => {
  try {
    return jsonLogic.apply(condition, data);
  } catch (error: any) {
    throw new Error(`Condition evaluation failed: ${error.message}`);
  }
};

export const parseCondition = (conditionString: string): any => {
  try {
    return JSON.parse(conditionString);
  } catch {
    throw new Error('Invalid condition JSON');
  }
};
