import { Boolean, Test } from "ts-toolbelt";
import { DataReference, ReferenceTarget } from "./references";

type CheckEveryReferenceTarget<R extends DataReference> = R extends R ? [ReferenceTarget<R>] extends [never] ? Boolean.False : Boolean.True : never;
declare const everyReferenceHasTarget: CheckEveryReferenceTarget<DataReference>;
Test.checks([everyReferenceHasTarget]);
