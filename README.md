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
      "substitutionProvider": { ... }
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
      "substitutionProvider": { ... }
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
      "substitutionProvider": { ... }
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

## License

This software is written by [Ruben Taelman](http://rubensworks.net/).

This code is released under the [MIT license](http://opensource.org/licenses/MIT).
