import { createParser } from "./create_parser";


// Based on syntax shown at https://dsg.uwaterloo.ca/watdiv/watdiv-schema-tutorial
export const parseWatdivModel = createParser<Array<WatdivDef>>(`

start = item*
item = NamespaceDeclaration / EntityDeclaration / PropertyDeclaration

NamespaceDeclaration = "#namespace" _ namespace:NSIdentifier "=" url:RestOfLine EOL { return { type: "namespace", name: namespace, url: url.join("") }; }


EntityDeclaration = ScalableEntity / NonScalableEntity

ScalableEntity =
    "<type>" _ name:EntityName _ EntityCount EOL
     propGroups:(PGroupDeclaration*)
     "</type>" EOL
     { return { type: "entity", scalable: true, name, propGroups }; }

NonScalableEntity =
    "<type*>" _ name:EntityName _ EntityCount EOL
     propGroups:(PGroupDeclaration*)
     "</type>" EOL
     { return { type: "entity", scalable: false, name, propGroups }; }


EntityCount = [0-9]+
EntityName = namespace:NSIdentifier ":" name:NCName { return { namespace, name }; }
PropertyName = namespace:NSIdentifier ":" name:NCName { return { namespace, name }; }



PGroupDeclaration =
    "<pgroup>"  (_  InstantiationProbability  ( _ "@" EntityName )?)?  EOL
    props:LiteralPropertyDeclaration+
    "</pgroup>" EOL
    { return props; }

InstantiationProbability = ( "1" ("." ("0")?)? ) / ( '0.' [0-9]+ )
LiteralPropertyDeclaration = '#predicate'   _   name:PropertyName   _   type:LiteralType  RestOfLine? EOL { return { name, type: type.toLowerCase() }; }
LiteralType = "INTEGER" / "integer" / "STRING" / "string" / "DATE" / "date" / "NAME" / "name"



PropertyDeclaration =
    "#association" _ from:EntityName _ field:PropertyName _ to:EntityName
    _ subjCardinality:SubjectCardinality _ objCardinality:ObjectCardinality
    RestOfLine? EOL
    { return { type: "ref", from, field, to, subjCardinality, objCardinality}; }

SubjectCardinality = val:("1" / "2") { return parseInt(val, 10); }
ObjectCardinality = val:([1-9][0-9]*) { return parseInt(val, 10); }
ObjectCardinalityDistribution = "UNIFORM" / "uniform" / "NORMAL" / "normal"



NCName = name:[a-zA-Z0-9_]+ { return name.join(""); }
NSIdentifier = NCName

_ "whitespace" = [ \\t]+ { return null; }
EOL = _* [\\n\\r] { return null; }
RestOfLine = [^\\n\\r]+

`);


export type WatdivNamespace = { type: "namespace", name: string, url: string };
export type WatdivEntity = { type: "entity", scalable: boolean, name: WatdivName, propGroups: WatdivProp[][] };
export type WatdivRef = { type: "ref", from: WatdivName, to: WatdivName, field: WatdivName, subjCardinality: 1 | 2, objCardinality: number };

export type WatdivDef = WatdivNamespace | WatdivEntity | WatdivRef;
export const isWatdivNamespace = (d: WatdivDef): d is WatdivNamespace => d.type === "namespace";
export const isWatdivEntity = (d: WatdivDef): d is WatdivEntity => d.type === "entity";
export const isWatdivRef = (d: WatdivDef): d is WatdivRef => d.type === "ref";

export type WatdivName = { name: string, namespace: string };
export type WatdivProp = { name: WatdivName, type: WatdivPropertyType };
export type WatdivPropertyType = "integer" | "string" | "date" | "name";
