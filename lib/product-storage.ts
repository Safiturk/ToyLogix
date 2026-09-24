import { supabase } from "./supabase";
export const PRODUCT_BUCKET = "product-images";
export function isProductImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin &&
      /^\/storage\/v1\/object\/public\/product-images\/products\/[a-f0-9-]+\.(webp|png|jpg)$/.test(url.pathname) && !url.search;
  } catch { return false; }
}
export async function uploadProductImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error("Folosiți JPEG, PNG sau WebP de maximum 5 MB.");
  const bitmap = await createImageBitmap(file);
  let blob: Blob;
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Imaginea este prea mare.");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Procesarea imaginii nu este disponibilă.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Imagine invalidă")), "image/webp", 0.82));
  } finally { bitmap.close(); }
  const extension = blob.type === "image/webp" ? "webp" : "png";
  const path = `products/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error("Imaginea nu a putut fi încărcată. Verificați accesul la Storage.");
  return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data.publicUrl;
}
