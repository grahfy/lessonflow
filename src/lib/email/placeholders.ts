/**
 * Simple placeholder replacement engine for emails and invoices.
 * Supports replacing double-curly bracket variables (e.g. {{customerName}})
 * with dynamic values provided in a context object.
 */

export type PlaceholderContext = Record<string, string | number | null | undefined>;

/**
 * Replaces all placeholders in a string using the provided context.
 * 
 * @param template - The string containing placeholders like {{variableName}}
 * @param context - Key-value pairs for replacement
 * @returns The interpolated string
 */
export function interpolatePlaceholders(template: string, context: PlaceholderContext): string {
  if (!template) return "";
  
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    const value = context[key];
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  });
}
