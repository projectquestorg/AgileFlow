/**
 * Achromatic code theme matching the AgileFlow website: silver keywords,
 * light-gray strings, dim comments, on the site's card color (#111113).
 */
export const agileflowCodeTheme = {
  name: "agileflow-mono",
  type: "dark" as const,
  colors: {
    "editor.background": "#111113",
    "editor.foreground": "#e4e4e7",
  },
  tokenColors: [
    { settings: { foreground: "#e4e4e7" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#71717a", fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "markup.inline.raw"], settings: { foreground: "#d4d4d8" } },
    { scope: ["keyword", "storage", "storage.type", "keyword.operator.new", "keyword.control"], settings: { foreground: "#bfc3c9" } },
    { scope: ["entity.name.function", "support.function", "entity.name.tag", "entity.name.type", "support.class", "entity.name.class"], settings: { foreground: "#fafafa" } },
    { scope: ["constant", "constant.numeric", "constant.language", "variable.other.constant", "support.constant"], settings: { foreground: "#a1a1aa" } },
    { scope: ["entity.other.attribute-name", "meta.object-literal.key", "support.type.property-name"], settings: { foreground: "#d4d4d8" } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#a1a1aa" } },
    { scope: ["variable", "variable.parameter", "variable.other"], settings: { foreground: "#e4e4e7" } },
    { scope: ["markup.heading", "markup.bold"], settings: { foreground: "#fafafa", fontStyle: "bold" } },
    { scope: ["markup.inserted"], settings: { foreground: "#e4e4e7" } },
    { scope: ["markup.deleted"], settings: { foreground: "#71717a" } },
  ],
}
