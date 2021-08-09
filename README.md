# SPARQL Query Parameter Instantiator

[![Build status](https://github.com/rubensworks/sparql-query-parameter-instantiator.js/workflows/CI/badge.svg)](https://github.com/rubensworks/sparql-query-parameter-instantiator.js/actions?query=workflow%3ACI)
[![Coverage Status](https://coveralls.io/repos/github/rubensworks/sparql-query-parameter-instantiator.js/badge.svg?branch=master)](https://coveralls.io/github/rubensworks/sparql-query-parameter-instantiator.js?branch=master)
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
  "@context": "https://linkedsoftwaredependencies.org/bundles/npm/sparql-query-parameter-instantiator/^1.0.0/components/context.jsonld",
  "@id": "urn:sparql-query-parameter-instantiator:default",
  "@type": "QueryInstantiator",
  "QueryInstantiator:_count": 5,
  "QueryInstantiator:_providers": [
    {
      "@type": "QueryTemplateProvider",
      "QueryTemplateProvider:_templateFilePath": "path/to/template1.sparql",
      "QueryTemplateProvider:_destinationFilePath": "path/to/output.sparql",
      "QueryTemplateProvider:_variables": [
        {
          "@type": "VariableTemplateNamedNode",
          "VariableTemplateNamedNode:_name": "person",
          "VariableTemplateNamedNode:_substitutionProvider": {
            "@type": "SubstitutionProviderCsv",
            "SubstitutionProviderCsv:_csvFilePath": "path/to/params.csv",
            "SubstitutionProviderCsv:_columnName": "person"
          }
        }
      ]
    }
  ]
}

```

The important parts in this config file are:

* `"QueryInstantiator:_count"`: How many times each query template should be instantiated.
* `"QueryInstantiator:_providers"` A list of query templates.
* `"QueryTemplateProvider:_templateFilePath"`: The path to a SPARQL (text) file.
* `"QueryTemplateProvider:_destinationFilePath"`: The path of the text file that will be created with the instantiated queries (seperated by empty lines).
* `"QueryTemplateProvider:_variables"`: An array of variables that have to be instantiated.
* `"*:_substitionProvider"`: A provider of values for this variable.

## Configure

### Variable Templates

A variable template indicates a variable in the template query that must be instantiated with certain values.

#### Named Node Variable Template

A variable template that always produces IRIs.

```json
{
  "QueryTemplateProvider:_variables": [
    {
      "@type": "VariableTemplateNamedNode",
      "VariableTemplateNamedNode:_name": "person",
      "VariableTemplateNamedNode:_substitutionProvider": { ... }
    }
  ]
}
```

Parameters:

* `"VariableTemplateNamedNode:_name"`: The name of the variable in the SPARQL query template to instantiate (without `?` prefix).
* `"VariableTemplateNamedNode:_substitionProvider"`: A provider of substitution values.
* `"VariableTemplateNamedNode:_valueTransformers"`: An optional array of value transformers.

#### Literal Variable Template

A variable template that always produces literals.

```json
{
  "QueryTemplateProvider:_variables": [
    {
      "@type": "VariableTemplateLiteral",
      "VariableTemplateLiteral:_name": "person",
      "VariableTemplateLiteral:_language": "en-us",
      "VariableTemplateLiteral:_datatype": "http://www.w3.org/2001/XMLSchema#number",
      "VariableTemplateLiteral:_substitutionProvider": { ... }
    }
  ]
}
```

Parameters:

* `"VariableTemplateLiteral:_name"`: The name of the variable in the SPARQL query template to instantiate (without `?` prefix).
* `"VariableTemplateLiteral:_language"`: _(Optional)_ The language for produced literals.
* `"VariableTemplateLiteral:_datatype"`: _(Optional)_ The datatype for produced literals.
* `"VariableTemplateLiteral:_substitutionProvider"`: A provider of substitution values.
* `"VariableTemplateLiteral:_valueTransformers"`: An optional array of value transformers.

### Substitution Providers

Substitution providers supply values for substituting variables in a query template.

#### CSV Substitution Provider

Provides values from a CSV file.

```json
{
  "VariableTemplateNamedNode:_substitutionProvider": {
    "@type": "SubstitutionProviderCsv",
    "SubstitutionProviderCsv:_csvFilePath": "path/to/params.csv",
    "SubstitutionProviderCsv:_columnName": "person"
  }
}
```

Parameters:

* `"SubstitutionProviderCsv:_csvFilePath"`: File path to a CSV file.
* `"SubstitutionProviderCsv:_columnName"`: The column name of the CSV file to extract values from.
* `"SubstitutionProviderCsv:_separator"`: _(Optional)_ Column separator.

#### Static Substitution Provider

Provides values statically by defining them directly in the config file.

```json
{
  "VariableTemplateNamedNode:_substitutionProvider": {
    "@type": "SubstitutionProviderStatic",
    "SubstitutionProviderStatic:_values": [
      "value1",
      "value2",
      "value3"
    ]
  }
}
```

Parameters:

* `"SubstitutionProviderStatic:_values"`: An array of values to provide.

### Value Transformers

Value transformers can be attached to variable templates
for modifying a value originating from a substitution provider.

#### Replace IRI Value Transformer

A value transformer that that replaces (parts of) IRIs.

```json
{
  "VariableTemplateNamedNode:_valueTransformers": [
    {
      "@type": "ValueTransformerReplaceIri",
      "ValueTransformerReplaceIri:_searchRegex": "^http://www.ldbc.eu",
      "ValueTransformerReplaceIri:_replacementString": "http://localhost:3000/www.ldbc.eu"
    }
  ]
}
```

Options:
* `"ValueTransformerReplaceIri:_searchRegex"`: The regex to search for.
* `"ValueTransformerReplaceIri:_replacementString"`: The string to replace.

## License

This software is written by [Ruben Taelman](http://rubensworks.net/).

This code is released under the [MIT license](http://opensource.org/licenses/MIT).
