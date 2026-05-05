# SPARQL Query Parameter Instantiator

[![Build status](https://github.com/SolidBench/sparql-query-parameter-instantiator.js/workflows/CI/badge.svg)](https://github.com/SolidBench/sparql-query-parameter-instantiator.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/SolidBench/sparql-query-parameter-instantiator.js/badge.svg?branch=master)](https://coveralls.io/github/SolidBench/sparql-query-parameter-instantiator.js?branch=master)
[![npm version](https://badge.fury.io/js/sparql-query-parameter-instantiator.svg)](https://www.npmjs.com/package/sparql-query-parameter-instantiator)

Instantiate SPARQL query templates based on given substitution parameters.

For example, given a SPARQL query template and a CSV file,
it can generate multiple instantiations of this template based on the CSV rows.

Template:
```sparql
SELECT * WHERE { ?s ?p ?o. }
```

CSV file:
```csv
s,p
ex:s1,ex:p1
ex:s2,ex:p2
ex:s3,ex:p3
ex:s4,ex:p4
ex:s5,ex:p5
```

The resulting queries for the instantiation of `?s` for a count of 3:
```text
SELECT * WHERE { <ex:s1> ?p ?o. }

SELECT * WHERE { <ex:s2> ?p ?o. }

SELECT * WHERE { <ex:s3> ?p ?o. }
```

Queries per template are separated by empty newlines.

## Installation

```bash
$ npm install -g sparql-query-parameter-instantiator
```
or
```bash
$ yarn global add sparql-query-parameter-instantiator
```

## Usage

### Invoke from the command line

This tool can be used on the command line as `sparql-query-parameter-instantiator`,
which takes as single parameter the path to a config file:

```bash
$ sparql-query-parameter-instantiator path/to/config.json
```

### Config file

The config file that should be passed to the command line tool has the following JSON structure:

```json
{
  "@context": "https://linkedsoftwaredependencies.org/bundles/npm/sparql-query-parameter-instantiator/^2.0.0/components/context.jsonld",
  "@id": "urn:sparql-query-parameter-instantiator:default",
  "@type": "QueryInstantiator",
  "count": 5,
  "providers": [
    {
      "@type": "QueryTemplateProvider",
      "templateFilePath": "path/to/template1.sparql",
      "destinationFilePath": "path/to/output.sparql",
      "variables": [
        {
          "@type": "VariableTemplateNamedNode",
          "name": "person",
          "substitutionProvider": {
            "@type": "SubstitutionProviderCsv",
            "csvFilePath": "path/to/params.csv",
            "columnName": "person"
          }
        }
      ]
    }
  ]
}
```

The important parts in this config file are:

* `"count"`: How many times each query template should be instantiated.
* `"providers"` A list of query templates.
* `"templateFilePath"`: The path to a SPARQL (text) file.
* `"destinationFilePath"`: The path of the text file that will be created with the instantiated queries (seperated by empty lines).
* `"variables"`: An array of variables that have to be instantiated.
* `"*:_substitionProvider"`: A provider of values for this variable.

## Configure

### Variable Templates

A variable template indicates a variable in the template query that must be instantiated with certain values.

#### Named Node Variable Template

A variable template that always produces IRIs.

```json
{
  "variables": [
    {
      "@type": "VariableTemplateNamedNode",
      "name": "person",
      "substitutionProvider": { /* ... */ }
    }
  ]
}
```

Parameters:

* `"name"`: The name of the variable in the SPARQL query template to instantiate (without `?` prefix).
* `"substitionProvider"`: A provider of substitution values.
* `"valueTransformers"`: An optional array of value transformers.

#### Literal Variable Template

A variable template that always produces literals.

```json
{
  "variables": [
    {
      "@type": "VariableTemplateLiteral",
      "name": "person",
      "language": "en-us",
      "datatype": "http://www.w3.org/2001/XMLSchema#number",
      "substitutionProvider": { /* ... */ }
    }
  ]
}
```

Parameters:

* `"name"`: The name of the variable in the SPARQL query template to instantiate (without `?` prefix).
* `"language"`: _(Optional)_ The language for produced literals.
* `"datatype"`: _(Optional)_ The datatype for produced literals.
* `"substitutionProvider"`: A provider of substitution values.
* `"valueTransformers"`: An optional array of value transformers.

#### Timestamp Variable Template

A template for instantiating RDF xsd:dateTime Literals from a variable value that represents a UNIX timestamp.

```json
{
  "variables": [
    {
      "@type": "VariableTemplateTimestamp",
      "name": "maxDate",
      "substitutionProvider": {
        "@type": "SubstitutionProviderCsv",
        "csvFilePath": "dates.csv",
        "columnName": "maxDate"
      }
    }
  ]
}
```

Parameters:

* `"name"`: The name of the variable in the SPARQL query template to instantiate (without `?` prefix).
* `"datatype"`: _(Optional)_ The datatype for produced literals. Defaults to `xsd:dateTime`.
* `"substitutionProvider"`: A provider of substitution values.
* `"valueTransformers"`: An optional array of value transformers.

#### List Variable Template

A template for instantiating arrays as RDF Literals concatenated by a given separator.
An inner variable template must be passed, which will be invoked for every array value.

```json
{
  "variables": [
    {
      "@type": "VariableTemplateList",
      "name": "tagNames",
      "separator": ", ",
      "substitutionProvider": { /* ... */ },
      "innerTemplate": {
        "@type": "VariableTemplateLiteral",
        "name": "tagName"
      }
    }
  ]
}
```

Parameters:

* `"name"`: The name of the variable in the SPARQL query template to instantiate (without `?` prefix).
* `"separator"`: The separator string.
* `"innerTemplate"`: The variable template to apply for each list element.
* `"substitutionProvider"`: A provider of substitution values.
* `"valueTransformers"`: An optional array of value transformers.

### Substitution Providers

Substitution providers supply values for substituting variables in a query template.

#### CSV Substitution Provider

Provides values from a CSV file.

```json
{
  "substitutionProvider": {
    "@type": "SubstitutionProviderCsv",
    "csvFilePath": "path/to/params.csv",
    "columnName": "person"
  }
}
```

Parameters:

* `"csvFilePath"`: File path to a CSV file.
* `"columnName"`: The column name of the CSV file to extract values from.
* `"separator"`: _(Optional)_ Column separator.

#### Static Substitution Provider

Provides values statically by defining them directly in the config file.

```json
{
  "substitutionProvider": {
    "@type": "SubstitutionProviderStatic",
    "values": [
      "value1",
      "value2",
      "value3"
    ]
  }
}
```

Parameters:

* `"values"`: An array of values to provide.

#### Union Substitution Provider

A substitution provider that takes the union over the values of the given subsitution provider.

```json
{
  "substitutionProvider": {
    "@type": "SubstitutionProviderUnion",
    "substitutionProviders": [
      {
        "@type": "SubstitutionProviderStatic",
        "values": [
          "value1",
          "value2",
          "value3"
        ]
      },
      {
        "@type": "SubstitutionProviderCsv",
        "csvFilePath": "path/to/params.csv",
        "columnName": "person"
      }
    ]
  }
}
```

Parameters:

* `"substitutionProviders"`: The substitution provider to union over.

#### Shuffle Substitution Provider

A substitution provider that wraps over another substitution provider and shuffles all values based on a seed.

```json
{
  "substitutionProvider": {
    "@type": "SubstitutionProviderShuffle",
    "seed": 12345,
    "substitutionProvider": {
      "@type": "SubstitutionProviderStatic",
      "values": [
        "value1",
        "value2",
        "value3"
      ]
    }
  }
}
```

Parameters:

* `"substitutionProvider"`: The substitution provider to shuffle.
* `"seed"`: The random seed for shuffling.

### Value Transformers

Value transformers can be attached to variable templates
for modifying a value originating from a substitution provider.

#### Replace IRI Value Transformer

A value transformer that that replaces (parts of) IRIs.

```json
{
  "valueTransformers": [
    {
      "@type": "ValueTransformerReplaceIri",
      "searchRegex": "^http://www.ldbc.eu",
      "replacementString": "http://localhost:3000/www.ldbc.eu"
    }
  ]
}
```

Options:
* `"searchRegex"`: The regex to search for.
* `"replacementString"`: The string to replace.

#### Distribute IRI Value Transformer

A value transformer that that replaces (parts of) IRIs, deterministically distributing the replacements over a list of multiple destination IRI based on a matched number.
This is fully compatible with [`rdf-dataset-fragmenter`](https://github.com/SolidBench/rdf-dataset-fragmenter.js)'s `QuadTransformerDistributeIri` which produces the same deterministic replacements.

```json
{
  "valueTransformers": [
    {
      "@type": "ValueTransformerDistributeIri",
      "searchRegex": "^http://www.ldbc.eu",
      "replacementStrings": [
        "http://localhost:3000/www.ldbc.eu",
        "http://localhost:3030/www.ldbc.eu",
        "http://localhost:3060/www.ldbc.eu"
      ]
    }
  ]
}
```

This requires at least one group-based replacement, of which the first group must match a number.

The matched number is used to choose one of the `replacementStrings` in a deterministic way: `replacementStrings[number % replacementStrings.length]`

```json
{
  "@type": "ValueTransformerDistributeIri",
  "searchRegex": "^http://www.ldbc.eu/data/pers([0-9]*)$",
  "replacementStrings": [
    "https://one.example.com/users$1/profile/card#me",
    "https://two.example.com/users$1/profile/card#me",
    "https://three.example.com/users$1/profile/card#me",
    "https://four.example.com/users$1/profile/card#me"
  ]
}
```

Options:
* `"searchRegex"`: The regex to search for. A group is identified via `()` in the search regex. There must be at least one group. The first group must match a number.
* `"replacementStrings"`: A list of string to use as replacements. A reference to the matched group can be made via `$...`.

#### Replace IRI Value Transformer

A value transformer that pads strings until a given length.

```json
{
  "valueTransformers": [
    {
      "@type": "ValueTransformerPad",
      "paddingCharacter": "0",
      "paddingLength": "20",
      "start": true
    }
  ]
}
```

Options:
* `"paddingCharacter"`: The character to pad.
* `"paddingLength"`: The string length to reach.
* `"start"`: If padding should happen at the start of the string, otherwise it will pad from the end.

## Query Sequence Instantiator

Used by [SolidSessionBench.js](https://github.com/RubenEschauzier/SolidBench.js/tree/feature/user-based-query-sequences) to generate realistic sequences of SPARQL queries per user.
Unlike the standard instantiator, this generates ordered sequences where consecutive queries within a session share variable bindings derived from the previous query's results.
Sequences can also include query refinements — additions, removals, or substitutions of query patterns that simulate a user iteratively exploring data.

### Invoke from the command line

The sequence instantiator uses the same CLI entry point:

```bash
$ sparql-query-parameter-instantiator path/to/sequence-config.json
```

### Config file

```json
{
  "@context": "https://linkedsoftwaredependencies.org/bundles/npm/sparql-query-parameter-instantiator/^2.0.0/components/context.jsonld",
  "@id": "urn:sparql-query-parameter-instantiator:default",
  "@type": "QuerySequenceInstantiator",
  "count": 100,
  "seed": 42,
  "destinationFilePath": "path/to/sequences/",
  "metadataDestinationFilePath": "path/to/metadata/",
  "personProvider": {
    "@type": "VariableTemplateNamedNode",
    "name": "person",
    "substitutionProvider": {
      "@type": "SubstitutionProviderCsv",
      "csvFilePath": "path/to/persons.csv",
      "columnName": "person"
    }
  },
  "sequenceGenerator": {
    "@type": "SequenceGenerator",
    "meanLogSequenceLength": 1.7,
    "stdLogSequenceLength": 0.5,
    "meanLogSessionLength": 1.7,
    "stdLogSessionLength": 0.5,
    "meanLogTransitionProbability": -2,
    "stdLogTransitionProbability": 0.5,
    "refinementPatternProbability": 0.1,
    "temperature": 0.5,
    "findNextInstantiationValue": { /* ... */ }
  },
  "providers": [
    {
      "@type": "QuerySequenceTemplateProvider",
      "templateFilePath": "path/to/template.sparql",
      "name": "interactive-discover-1",
      "queryTask": "discover",
      "instantiationVariableTypeMap": { "person": "person" },
      "outputVariableTypeMap": { "person": "person" },
      "nextTemplates": ["interactive-discover-2", "interactive-short-1"],
      "nextTemplateProbabilities": [0.5, 0.5],
      "minRefinementLength": 1,
      "maxRefinementLength": 3,
      "maxLogits": 100,
      "refinementPatternsFilePath": "path/to/refinements/interactive-discover-1.json",
      "variables": [
        {
          "@type": "VariableTemplateNamedNode",
          "name": "person",
          "substitutionProvider": {
            "@type": "SubstitutionProviderCsv",
            "csvFilePath": "path/to/params.csv",
            "columnName": "person"
          }
        }
      ]
    }
  ]
}
```

The important parts in this config file are:

* `"count"`: How many query sequences to generate (one per user).
* `"seed"`: Random seed for reproducible sequence generation.
* `"destinationFilePath"`: Directory where per-user sequence files (`sequence_N.sparql`) will be written.
* `"metadataDestinationFilePath"`: _(Optional)_ Directory for per-sequence metadata JSON files. Defaults to `destinationFilePath`.
* `"personProvider"`: A variable template backed by a substitution provider that lists the users for whom sequences are generated.
* `"sequenceGenerator"`: Controls the statistical properties of the generated sequences (lengths, session transitions, refinement probability).
* `"providers"`: List of `QuerySequenceTemplateProvider` instances describing the available query templates.

### Configure

#### Query Sequence Template Provider

A provider that builds query sequence templates with session-awareness and optional refinement support.

```json
{
  "@type": "QuerySequenceTemplateProvider",
  "templateFilePath": "path/to/template.sparql",
  "name": "interactive-discover-1",
  "queryTask": "discover",
  "instantiationVariableTypeMap": { "person": "person" },
  "outputVariableTypeMap": { "person": "person" },
  "nextTemplates": ["interactive-discover-2"],
  "nextTemplateProbabilities": [1.0],
  "minRefinementLength": 1,
  "maxRefinementLength": 3,
  "maxLogits": 100,
  "refinementPatternsFilePath": "path/to/refinements/interactive-discover-1.json",
  "variables": [ /* same structure as QueryTemplateProvider */ ]
}
```

Parameters:

* `"templateFilePath"`: The path to a SPARQL template file.
* `"name"`: Unique identifier for this template, used to reference it in `nextTemplates`.
* `"queryTask"`: A label grouping related templates into a task (e.g. `"discover"`).
* `"instantiationVariableTypeMap"`: Maps variables in this template (without `?` prefix) to their entity type. Used to match output variables from the previous query to input variables for this query.
* `"outputVariableTypeMap"`: Maps SELECT variables in this template to their entity type. Used to provide instantiation values to the next query in the session.
* `"nextTemplates"`: Ordered list of template `name`s that may follow this template within a session.
* `"nextTemplateProbabilities"`: _(Optional)_ Probability weight for each entry in `nextTemplates`. Must have the same length. Defaults to equal weights.
* `"minRefinementLength"`: Minimum number of refinement steps when a refinement sequence is triggered.
* `"maxRefinementLength"`: Maximum number of refinement steps when a refinement sequence is triggered.
* `"maxLogits"`: Maximum number of candidate entities considered during probability-weighted instantiation.
* `"iriTransformer"`: _(Optional)_ A value transformer applied to IRIs during instantiation.
* `"refinementPatternsFilePath"`: _(Optional)_ Path to a JSON file defining the refinement patterns for this template.
* `"variables"`: Array of variable templates, same structure as in `QueryTemplateProvider`.

#### Sequence Generator

Controls how sequences and sessions are statistically shaped.

```json
{
  "@type": "SequenceGenerator",
  "meanLogSequenceLength": 1.7,
  "stdLogSequenceLength": 0.5,
  "meanLogSessionLength": 1.7,
  "stdLogSessionLength": 0.5,
  "meanLogTransitionProbability": -2,
  "stdLogTransitionProbability": 0.5,
  "refinementPatternProbability": 0.1,
  "temperature": 0.5,
  "findNextInstantiationValue": { /* ... */ }
}
```

Parameters:

* `"meanLogSequenceLength"`: Log-normal mean for the total number of queries in a sequence.
* `"stdLogSequenceLength"`: Log-normal standard deviation for the sequence length.
* `"meanLogSessionLength"`: Log-normal mean for the number of queries in a single session within a sequence.
* `"stdLogSessionLength"`: Log-normal standard deviation for the session length.
* `"meanLogTransitionProbability"`: Log-normal mean for the probability of switching to a different session at each step.
* `"stdLogTransitionProbability"`: Log-normal standard deviation for the session transition probability.
* `"refinementPatternProbability"`: Probability that a query instantiation triggers a refinement sequence.
* `"temperature"`: Softmax temperature for entity selection from probability-weighted candidates.
* `"findNextInstantiationValue"`: A `QueryNextInstantiatorValue` instance used to derive binding values for the next query from the previous query's results.

#### Refinement Patterns

A refinement patterns file is a JSON array. Each element describes one possible mutation that can be applied to the query template. Mutations are randomly selected and applied when a refinement sequence is triggered.

Each object has the following base fields:

* `"id"`: Unique numeric identifier for the pattern.
* `"type"`: The operator type to modify: `BGP`, `OPTIONAL`, `UNION`, `FILTER`, or `SUB`.
* `"operation"`: The action to perform: `addition` or `removal`.
* `"description"`: Human-readable explanation of the pattern.
* `"location"`: Zero-based index of the target block within the query's WHERE clause.
* `"target"`: The payload defining what to add or remove. Structure varies by `type` (see below).

**BGP and OPTIONAL** — target is an array of triple objects:

```json
[
  {
    "type": "BGP",
    "id": 2,
    "operation": "addition",
    "description": "Add triple to obtain the browser used to post the message",
    "location": 0,
    "target": [
      {
        "subject": { "value": "message", "termType": "variable" },
        "predicate": { "value": "http://localhost:3000/www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/browserUsed", "termType": "namedNode" },
        "object": { "value": "browser", "termType": "variable" }
      }
    ]
  }
]
```

Each term object has a `"value"` and a `"termType"` of `variable`, `namedNode`, or `literal` (objects only).

**UNION** — target is an array of exactly two triple arrays (left and right branches):

```json
[
  {
    "type": "UNION",
    "id": 2,
    "operation": "addition",
    "description": "Add union for liked messages and comments",
    "location": 0,
    "target": [
      [
        {
          "subject": { "value": "person", "termType": "variable" },
          "predicate": { "value": "http://example.org/likes", "termType": "namedNode" },
          "object": { "value": "liked", "termType": "variable" }
        }
      ],
      [
        {
          "subject": { "value": "person", "termType": "variable" },
          "predicate": { "value": "http://example.org/dislikes", "termType": "namedNode" },
          "object": { "value": "disliked", "termType": "variable" }
        }
      ]
    ]
  }
]
```

Pass an empty array for one side to modify only the other branch.

**FILTER** — target is an array of SPARQL.js expression objects:

```json
[
  {
    "type": "FILTER",
    "id": 5,
    "operation": "addition",
    "description": "Only select messages posted earlier than an instantiation value",
    "location": 0,
    "target": [
      {
        "type": "operation",
        "operator": "<",
        "args": [
          { "termType": "variable", "value": "messageCreationDate" },
          { "termType": "variable", "value": "timestamp" }
        ]
      }
    ]
  }
]
```

**SUB** — substitutes a template variable with a dynamically determined value at runtime:

```json
[
  {
    "type": "SUB",
    "id": 7,
    "operation": "addition",
    "description": "Substitute the person parameter in query",
    "location": 0,
    "target": { "value": "person", "termType": "variable" }
  }
]
```

Refinement pattern variables (e.g., `timestamp` in a FILTER) can be instantiated by defining a `substitutionProvider` on the corresponding variable in the `QuerySequenceTemplateProvider`, the same way as regular query variables.

For concrete examples of refinement pattern files, see the [SolidSessionBench.js refinement templates](https://github.com/RubenEschauzier/SolidBench.js/tree/feature/user-based-query-sequences/templates/refinements).

## License

This software is written by [Ruben Taelman](http://rubensworks.net/).

This code is released under the [MIT license](http://opensource.org/licenses/MIT).
