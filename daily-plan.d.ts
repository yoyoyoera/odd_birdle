export const epochDate: string;
export const challengeKeys: string[];
export const challengeNames: Record<string, string>;
export const maxAttempts: (key: string) => number;
export const utcDate: (now?: number) => string;
export const isDate: (value: unknown) => value is string;
export const dayIndex: (date: string) => number;
export interface DailyPlan { date: string; number: number; key: string; cpuLevel: number; attempts: number; points: number }
export const dailyFor: (date: string) => DailyPlan;
export const minimumSeconds: (points: number) => number;
