export type KeyShape<T> = {
    [P in keyof T]-?: null
};
