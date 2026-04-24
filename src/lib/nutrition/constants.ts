// src/lib/nutrition/constants.ts

export const DIETS = [
  { id: "normal",      label: "Normal",        spoonacular: null },
  { id: "vegetarian",  label: "Vegetarisch",   spoonacular: "vegetarian" },
  { id: "vegan",       label: "Vegan",         spoonacular: "vegan" },
  { id: "pescatarian", label: "Pescetarisch",  spoonacular: "pescetarian" },
  { id: "keto",        label: "Keto",          spoonacular: "ketogenic" },
  { id: "paleo",       label: "Paleo",         spoonacular: "paleo" },
  { id: "glutenfree",  label: "Glutenfrei",    spoonacular: "gluten free" },
] as const;

export type DietId = (typeof DIETS)[number]["id"];

export const ALLERGIES = [
  { id: "dairy",     label: "Milchprodukte", spoonacular: "dairy" },
  { id: "egg",       label: "Ei",            spoonacular: "egg" },
  { id: "gluten",    label: "Gluten",        spoonacular: "gluten" },
  { id: "grain",     label: "Getreide",      spoonacular: "grain" },
  { id: "peanut",    label: "Erdnüsse",      spoonacular: "peanut" },
  { id: "seafood",   label: "Meeresfrüchte", spoonacular: "seafood" },
  { id: "sesame",    label: "Sesam",         spoonacular: "sesame" },
  { id: "shellfish", label: "Schalentiere",  spoonacular: "shellfish" },
  { id: "soy",       label: "Soja",          spoonacular: "soy" },
  { id: "sulfite",   label: "Sulfite",       spoonacular: "sulfite" },
  { id: "treenut",   label: "Baumnüsse",     spoonacular: "tree nut" },
  { id: "wheat",     label: "Weizen",        spoonacular: "wheat" },
] as const;

export type AllergyId = (typeof ALLERGIES)[number]["id"];

export function dietLabel(id: string | null | undefined): string {
  if (!id) return "Normal";
  return DIETS.find((d) => d.id === id)?.label ?? id;
}

export function allergyLabels(ids: string[]): string[] {
  return ids.map((id) => ALLERGIES.find((a) => a.id === id)?.label ?? id);
}

export function mapDietToSpoonacular(id: string | null | undefined): string | null {
  if (!id) return null;
  return DIETS.find((d) => d.id === id)?.spoonacular ?? null;
}

export function mapAllergiesToSpoonacular(ids: string[]): string {
  return ids
    .map((id) => ALLERGIES.find((a) => a.id === id)?.spoonacular)
    .filter(Boolean)
    .join(",");
}
