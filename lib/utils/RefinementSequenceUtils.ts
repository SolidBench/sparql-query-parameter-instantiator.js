import type { BgpPattern, Expression, Pattern, Term, Triple } from 'sparqljs';

export function extractTriplePatternsPerOperator(
  patterns: Pattern[],
): Record<string, Triple[][]> {
  const bgpsPerOperator: Record<string, BgpPattern[]> = {};
  extractBgpPerOperator(patterns, bgpsPerOperator, 'bgp');

  const triplesPerOperator: Record<string, Triple[][]> = {};
  for (const operator in bgpsPerOperator) {
    triplesPerOperator[operator] = bgpsPerOperator[operator].map(bgp => bgp.triples);
  }
  return triplesPerOperator;
}

export function extractBgpPerOperator(
  patterns: Pattern[],
  bgpsPerOperator: Record<string, BgpPattern[]>,
  previousOperator: 'bgp' | 'union' | 'optional',
) {
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'group':
        extractBgpPerOperator(pattern.patterns, bgpsPerOperator, previousOperator);
        break;

      case 'query':
        if (pattern.where) {
          extractBgpPerOperator(pattern.where, bgpsPerOperator, 'bgp');
        }
        break;

      case 'bgp':
        if (!bgpsPerOperator[previousOperator]) {
          bgpsPerOperator[previousOperator] = [];
        }
        bgpsPerOperator[previousOperator].push(pattern);
        break;

      case 'union':
        if (!bgpsPerOperator.union) {
          bgpsPerOperator.union = [];
        }
        extractBgpPerOperator(pattern.patterns, bgpsPerOperator, 'union');
        break;

      case 'optional':
        if (!bgpsPerOperator.optional) {
          bgpsPerOperator.optional = [];
        }
        extractBgpPerOperator(pattern.patterns, bgpsPerOperator, 'optional');
        break;

      case 'filter':
        break;

      default:
        break;
    }
  }
}

export function extractExpressionPerOperator(
  patterns: Pattern[],
  expressionsPerOperator: Record<string, Expression[]>,
  previousOperator: 'filter',
) {
  for (const pattern of patterns) {
    switch (pattern.type) {
      case 'query':
        if (pattern.where) {
          extractExpressionPerOperator(pattern.where, expressionsPerOperator, previousOperator);
        }
        break;

      case 'group':
      case 'union':
      case 'optional':
      case 'graph':
      case 'minus':
      case 'service':
        extractExpressionPerOperator(pattern.patterns, expressionsPerOperator, previousOperator);
        break;

      case 'filter':
        if (!expressionsPerOperator[previousOperator]) {
          expressionsPerOperator[previousOperator] = [];
        }
        expressionsPerOperator[previousOperator].push(pattern.expression);
        break;

      default:
        break;
    }
  }
}

export function getVariablesInExpression(expr: Expression): Set<string> {
  const variables = new Set<string>();

  function recurse(e: Expression | Term | any): void {
    if (!e) {
      return;
    }

    // Handle arrays (like args in operations)
    if (Array.isArray(e)) {
      for (const item of e) {
        recurse(item);
      }
      return;
    }

    // Handle different expression types
    switch (e.type) {
      case 'operation':
        // Handle operation arguments
        if (e.args && Array.isArray(e.args)) {
          for (const arg of e.args) {
            recurse(arg);
          }
        }
        break;

      case 'functionCall':
        // Handle function calls with arguments
        if (e.args && Array.isArray(e.args)) {
          for (const arg of e.args) {
            recurse(arg);
          }
        }
        break;

      case 'term':
        // Handle term expressions
        if (e.term) {
          recurse(e.term);
        }
        break;

      case 'variable':
        // Direct variable reference
        if (e.value) {
          variables.add(e.value.startsWith('?') ? e.value.slice(1) : e.value);
        }
        break;

      case 'aggregate':
        // Handle aggregates (COUNT, SUM, etc.)
        if (e.expression) {
          recurse(e.expression);
        }
        if (e.separator) {
          recurse(e.separator);
        }
        break;

      case 'namedExpression':
        // Handle named expressions (AS clauses)
        if (e.expression) {
          recurse(e.expression);
        }
        break;

      case 'exists':
      case 'notexists':
        // Handle EXISTS and NOT EXISTS
        if (e.input) {
          // This would need more complex handling for graph patterns
          // For now, just try to recurse if it's an expression
          recurse(e.input);
        }
        break;

      default:
        // Handle direct Term objects (Variable, Literal, NamedNode, etc.)
        if (e.termType === 'Variable') {
          const varName = e.value;
          variables.add(varName.startsWith('?') ? varName.slice(1) : varName);
        }

        // Handle other potential nested structures
        if (e.left) {
          recurse(e.left);
        }
        if (e.right) {
          recurse(e.right);
        }
        if (e.expression) {
          recurse(e.expression);
        }
        if (e.args) {
          recurse(e.args);
        }
        break;
    }
  }

  recurse(expr);
  return variables;
}

export function replacePrefixes(
  query: string,
  baseUrl: string,
  toReplace = 'http://localhost:3000/',
): string {
  return query.replace(toReplace, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}
