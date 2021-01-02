import { Boolean, Test } from "ts-toolbelt";
import { DataRelation, RelationTarget } from "./relations";

type CheckEveryRelationTarget<R extends DataRelation> = R extends R ? [RelationTarget<R>] extends [never] ? Boolean.False : Boolean.True : never;
declare const everyMigrationHasTarget: CheckEveryRelationTarget<DataRelation>;
Test.checks([everyMigrationHasTarget]);
