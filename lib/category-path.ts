export function categorySlug(name: string) {
  return name.trim().toLocaleLowerCase("ro").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}
