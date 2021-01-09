import { InternalProperty } from "../migrations/migrations_builder_api";
import { objectKeys } from "../../misc/typeguards";

type InternalReadKey = Exclude<InternalProperty, "branch" /* Branch not returned in a read */>;
const _internalProperties: { [P in InternalReadKey]: null } = {
    id: null,
    by: null,
    at: null,
    ts: null,
};
export const internalReadKeys = objectKeys(_internalProperties);
export const isInternalReadKey = (val: string): val is InternalReadKey => val in _internalProperties;
