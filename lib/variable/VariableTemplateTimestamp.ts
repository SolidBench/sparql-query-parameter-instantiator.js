import type * as RDF from '@rdfjs/types';
import type { ISubstitutionProvider, ISubstitutionProviderProbabilities } from '../substitution/ISubstitutionProvider';
import type { IValueTransformer } from '../valuetransformer/IValueTransformer';
import type { RawTerm } from './IVariableTemplate';
import { VariableTemplateAdapter } from './VariableTemplateAdapter';

/**
 * A template for instantiating RDF xsd:dateTime Literals from a variable value
 * that represents a UNIX timestamp or a raw RDF string.
 */
export class VariableTemplateTimestamp extends VariableTemplateAdapter {
  private readonly datatype: RDF.NamedNode;
  private readonly stripDatatype: boolean;

  public constructor(
    name: string,
    substitutionProvider?: ISubstitutionProvider,
    valueTransformers?: IValueTransformer[],
    datatype = 'http://www.w3.org/2001/XMLSchema#dateTime',
    stripDatatype = false,
  ) {
    super(name, substitutionProvider, valueTransformers);
    this.datatype = this.DF.namedNode(datatype);
    this.stripDatatype = stripDatatype;
  }

  public createTermInner(value: RawTerm): RDF.Term {
    if (Array.isArray(value)) {
      // eslint-disable-next-line unicorn/prefer-type-error
      throw new Error(`Received unsupported array value for the VariableTemplateTimestamp for ${this.name}`);
    }

    let parsedValue: string | number = value;

    // Clean the raw RDF string from the CSV if the option is enabled
    if (this.stripDatatype && typeof parsedValue === 'string') {
      // Splits at '^^' to remove datatype and replaces surrounding double quotes
      parsedValue = parsedValue.split('^^')[0].replaceAll(/^"|"$/gu, '');
    }

    // Determine if the value is a UNIX timestamp (only numbers) or an ISO string
    const isNumeric = typeof parsedValue === 'number' ||
      (typeof parsedValue === 'string' && /^\d+$/u.test(parsedValue));

    // Parse the date appropriately
    const dateObj = new Date(isNumeric ? Number.parseInt(String(parsedValue), 10) : parsedValue);

    // Guard against invalid date formats bypassing the parser
    if (Number.isNaN(dateObj.getTime())) {
      throw new RangeError(`Invalid date value provided to VariableTemplateTimestamp: ${value}`);
    }

    return this.DF.literal(
      dateObj.toISOString(),
      this.datatype,
    );
  }
}
