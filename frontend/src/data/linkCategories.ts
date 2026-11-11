export interface LinkCategory {
  name: string;
  links: string[];
}

export const LINK_CATEGORIES: LinkCategory[] = [
  {
    name: "Cause & Effect",
    links: ["causes", "leads to", "results in", "prevents", "influences"],
  },

  {
    name: "Part of",
    links: ["is part of", "is a type of", "consists of", "includes"],
  },

  {
    name: "Process",
    links: ["transforms into", "produces", "generates", "forms"],
  },

  {
    name: "Function",
    links: ["enables", "is used for", "supports", "allows"],
  },

  {
    name: "Requires",
    links: ["requires", "depends on", "is necessary for"],
  },

  {
    name: "Sequence",
    links: ["precedes", "follows", "occurs during"],
  },

  {
    name: "Relation",
    links: ["is related to", "is similar to", "differs from"],
  },

  {
    name: "Definition",
    links: ["is defined as", "means", "refers to", "is characterized by"],
  },
];
