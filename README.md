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

#### CSV Similarity-Based Probability Substitution Provider

A substitution provider for use with `QuerySequenceTemplateProvider` that drives similarity-based entity selection at the start of a logical session.
It reads two CSV files: an optional file of candidate values, and a required similarities file that maps each subject entity (e.g. a user) to a JSON-encoded array of `{ entity, similarity }` objects.
At session start, the similarity logits for the active user are extracted, passed through a softmax (using the configured `temperature`), and used to sample a starting entity that reflects the user's interests rather than picking uniformly at random.

```json
{
  "substitutionProvider": {
    "@type": "SubstitutionProviderCsvSimilarityBasedProbability",
    "csvFilePath": "path/to/values.csv",
    "columnName": "person",
    "columnNameSimilaritySubject": "user",
    "csvFilePathSimilarities": "path/to/similarities.csv"
  }
}
```

The similarities CSV must have at least two columns: one named by `columnNameSimilaritySubject` (the subject, e.g. a user IRI), and one named `similarities` containing a JSON array of `{ "entity": "...", "similarity": <number> }` objects.

Parameters:

* `"csvFilePath"`: _(Optional)_ Path to a CSV file of candidate values. When omitted, `getValues()` returns an empty list (values come solely from the similarity mapping).
* `"columnName"`: Column in `csvFilePath` to extract flat values from.
* `"columnNameSimilaritySubject"`: Column in `csvFilePathSimilarities` that identifies the subject entity (e.g. the user).
* `"csvFilePathSimilarities"`: Path to a CSV file mapping each subject entity to its similarity logits.
* `"separator"`: _(Optional)_ Column separator for both CSV files. Defaults to `,`.

#### Union Probabilities Substitution Provider

A variant of `SubstitutionProviderUnion` for providers that implement `ISubstitutionProviderProbabilities` (i.e., those that also expose similarity logits via `getValuesProbabilities`).
It merges the flat value lists and the similarity maps from all wrapped providers, sorting the combined similarity entries per subject in descending order.

```json
{
  "substitutionProvider": {
    "@type": "SubstitutionProviderUnionProbabilities",
    "substitutionProviders": [
      {
        "@type": "SubstitutionProviderCsvSimilarityBasedProbability",
        "columnName": "person",
        "columnNameSimilaritySubject": "user",
        "csvFilePathSimilarities": "path/to/similarities-a.csv"
      },
      {
        "@type": "SubstitutionProviderCsvSimilarityBasedProbability",
        "columnName": "person",
        "columnNameSimilaritySubject": "user",
        "csvFilePathSimilarities": "path/to/similarities-b.csv"
      }
    ]
  }
}
```

Parameters:

* `"substitutionProviders"`: Array of `ISubstitutionProviderProbabilities` providers to union over.

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

#### CSV Map Value Transformer

A value transformer that replaces IRI values by looking them up in a two-column CSV file (`key,value`).
Each line maps one IRI to another. If `invertMapping` is `true`, the columns are swapped so the second column becomes the key.

```json
{
  "valueTransformers": [
    {
      "@type": "ValueTransformerCsvMap",
      "file": "path/to/mapping.csv",
      "invertMapping": false
    }
  ]
}
```

The CSV file must contain exactly two comma-separated columns per line:

```
originalSubject,mappedSubject
http://original.example/entity1,http://mapped.example/entity1
http://original.example/entity2,http://mapped.example/entity2
```

Options:
* `"file"`: Path to the CSV mapping file.
* `"invertMapping"`: _(Optional)_ If `true`, the value column is used as the key and the key column as the replacement. Defaults to `false`.

## Query Sequence Instantiator

Used by [SolidSessionBench.js](https://github.com/RubenEschauzier/SolidBench.js/tree/feature/user-based-query-sequences) to generate realistic sequences of SPARQL queries per user.
Unlike the standard instantiator, this generates ordered sequences where consecutive queries within a session share variable bindings derived from the previous query's results.
Sequences can also include query refinements: additions, removals, or substitutions of query patterns that simulate a user iteratively exploring data.

### Logical sessions

A generated sequence models a user conducting multiple interleaved _logical sessions_.
Each session has a task focus and a sampled length drawn from a log-normal distribution.
Within a session, consecutive queries are linked: the output variables of one query are used to instantiate the next, simulating a user who clicks through results.
To determine these binding values, the previous query is re-executed against a centralized SPARQL endpoint (via a `QueryNextInstantiatorValue`), and the results are mapped from the centralized dataset IRIs back to the fragmented IRIs of the benchmark dataset.

At the _start_ of a new logical session, there is no previous query to link from.
In this case, if the query template's variable is backed by a `SubstitutionProviderCsvSimilarityBasedProbability` (or `SubstitutionProviderUnionProbabilities`), the first entity is sampled from a per-user similarity distribution rather than uniformly at random.
This models a user choosing a starting point that reflects their personal interests.

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
  "variables": []
}
```

Parameters:

* `"templateFilePath"`: The path to a SPARQL template file.
* `"name"`: Unique identifier for this template, used to reference it in `nextTemplates`.
* `"queryTask"`: A label grouping related templates into a task (e.g. `"discover"`).
* `"instantiationVariableTypeMap"`: Maps the instantiation variables in this template (without `?` prefix) to their entity type. Used to match output variables from the previous query to input variables for this query. This query can follow
any other query where the entity type in `outputVariableTypeMap` matches an entity type in this `instantiationVariableTypeMap`.
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
* `"findNextInstantiationValue"`: A `QueryNextInstantiatorValue` instance. At each step within a session it re-executes the previous query against a centralized SPARQL endpoint and maps the results back to fragmented IRIs so they can be used to instantiate the next query.

#### QueryNextInstantiatorValue

Bridges the fragmented benchmark dataset and the centralized dataset used to resolve cross-document links within a session.
It starts a QLever SPARQL endpoint using Docker, executes each previous query in its centralized form, and translates the resulting IRIs back to the fragmented form expected by the benchmark templates.

```json
{
  "@type": "QueryNextInstantiatorValue",
  "termMappingTransformerFragmentedToOriginal": {
    "@type": "ValueTransformerCsvMap",
    "file": "path/to/fragmented-to-original.csv"
  },
  "termMappingTransformerOriginalToFragmented": {
    "@type": "ValueTransformerCsvMap",
    "file": "path/to/original-to-fragmented.csv"
  },
  "transformers": [
    {
      "@type": "TermTransformerBiDirectional",
      "originalRegex": "^http://www.ldbc.eu",
      "originalString": "http://www.ldbc.eu",
      "fragmentedRegex": "^http://localhost:3000/www.ldbc.eu",
      "fragmentedString": "http://localhost:3000/www.ldbc.eu"
    }
  ],
  "qLever": {
    "@type": "QLeverInstance",
    "imageName": "adfreiburg/qlever",
    "dataLocations": ["path/to/centralized.ttl"],
    "port": 7001,
    "timeout": 30
  }
}
```

Parameters:

* `"termMappingTransformerFragmentedToOriginal"`: A `ValueTransformerCsvMap` that translates fragmented IRIs to centralized IRIs for entities (e.g. posts/comments) whose mapping is not a simple string replacement.
* `"termMappingTransformerOriginalToFragmented"`: A `ValueTransformerCsvMap` that translates centralized IRIs back to fragmented IRIs.
* `"transformers"`: An array of `TermTransformerBiDirectional` objects for IRI segments that _can_ be replaced by a regex. Applied from most-specific to most-general. Each transformer has:
  * `"originalRegex"` / `"originalString"`: Regex and replacement string for the centralized form.
  * `"fragmentedRegex"` / `"fragmentedString"`: Regex and replacement string for the fragmented form.
* `"qLever"`: A `QLeverInstance` that manages a Dockerized QLever server used to execute the centralized queries. Parameters:
  * `"imageName"`: Docker image name for QLever (e.g. `"adfreiburg/qlever"`).
  * `"dataLocations"`: Array of paths to TTL files to load into the index.
  * `"port"`: Local port for the QLever HTTP endpoint.
  * `"timeout"`: Per-query timeout in seconds.

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
