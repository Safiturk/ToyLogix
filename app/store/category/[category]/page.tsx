import { redirect } from "next/navigation";
import { categorySlug } from "@/lib/category-path";

type CategoryProps = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: CategoryProps) {
  const { category } = await params;
  return { title: `${category} | ToyLogix` };
}

export default async function CategoryPage({ params }: CategoryProps) {
  const { category } = await params;
  redirect(`/category/${encodeURIComponent(categorySlug(category))}`);
}
