export type ContentCategory = {
  id: number;
  key: string;
  label: string;
  colour: string;
  active: boolean;
};

export const BRAND_COLOUR_OPTIONS = [
  { label: "Coral", value: "var(--accent)" },
  { label: "Lagoon", value: "var(--good)" },
  { label: "Cyan", value: "var(--cyan)" },
  { label: "Violet", value: "var(--violet)" },
  { label: "Amber", value: "var(--warn)" },
  { label: "Blue", value: "var(--blue)" },
  { label: "Navy", value: "var(--navy)" },
];
