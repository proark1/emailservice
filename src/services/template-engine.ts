import Handlebars from "handlebars";

export function compileAndRender(
  htmlTemplate: string,
  variables: Record<string, any>,
  partials?: Record<string, string>,
): string {
  const hbs = Handlebars.create();

  // Register partials
  if (partials) {
    for (const [name, content] of Object.entries(partials)) {
      hbs.registerPartial(name, content);
    }
  }

  // Register safe helpers
  hbs.registerHelper("eq", (a: any, b: any) => a === b);
  hbs.registerHelper("ne", (a: any, b: any) => a !== b);
  hbs.registerHelper("gt", (a: any, b: any) => a > b);
  hbs.registerHelper("lt", (a: any, b: any) => a < b);
  hbs.registerHelper("and", (a: any, b: any) => a && b);
  hbs.registerHelper("or", (a: any, b: any) => a || b);
  hbs.registerHelper("not", (a: any) => !a);
  hbs.registerHelper("capitalize", (str: string) =>
    typeof str === "string" ? str.charAt(0).toUpperCase() + str.slice(1) : ""
  );
  hbs.registerHelper("uppercase", (str: string) =>
    typeof str === "string" ? str.toUpperCase() : ""
  );
  hbs.registerHelper("lowercase", (str: string) =>
    typeof str === "string" ? str.toLowerCase() : ""
  );
  hbs.registerHelper("default", (value: any, defaultValue: any) =>
    value != null && value !== "" ? value : defaultValue
  );

  const compiled = hbs.compile(htmlTemplate);
  return compiled(variables);
}

export function renderPlainText(
  textTemplate: string,
  variables: Record<string, any>,
  partials?: Record<string, string>,
): string {
  // For plain text, use Handlebars with noEscape
  const hbs = Handlebars.create();
  hbs.registerHelper("eq", (a: any, b: any) => a === b);
  hbs.registerHelper("ne", (a: any, b: any) => a !== b);
  hbs.registerHelper("gt", (a: any, b: any) => a > b);
  hbs.registerHelper("lt", (a: any, b: any) => a < b);
  hbs.registerHelper("and", (a: any, b: any) => a && b);
  hbs.registerHelper("or", (a: any, b: any) => a || b);
  hbs.registerHelper("not", (a: any) => !a);
  hbs.registerHelper("capitalize", (str: string) => typeof str === "string" ? str.charAt(0).toUpperCase() + str.slice(1) : "");
  hbs.registerHelper("uppercase", (str: string) => typeof str === "string" ? str.toUpperCase() : "");
  hbs.registerHelper("lowercase", (str: string) => typeof str === "string" ? str.toLowerCase() : "");
  hbs.registerHelper("default", (value: any, defaultValue: any) => value != null && value !== "" ? value : defaultValue);

  if (partials) {
    for (const [name, content] of Object.entries(partials)) {
      hbs.registerPartial(name, content);
    }
  }
  const compiled = hbs.compile(textTemplate, { noEscape: true });
  return compiled(variables);
}

export function detectVariablesAdvanced(template: string): string[] {
  const vars = new Set<string>();
  // Match {{variable}}, {{{variable}}}, skip block helpers like {{#if}}, {{/if}}, {{>partial}}
  const regex = /\{\{\{?([a-zA-Z_][\w.]*)\}?\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    const name = match[1];
    // Skip Handlebars keywords
    if (!["if", "else", "unless", "each", "with", "this", "lookup", "log"].includes(name) && !name.startsWith("@")) {
      vars.add(name.split(".")[0]); // Get root variable name
    }
  }
  return Array.from(vars);
}
