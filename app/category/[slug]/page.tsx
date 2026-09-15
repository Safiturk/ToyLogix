import Storefront from "../../store/Storefront";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${slug.replace(/-/g, " ")} | ToyLogix` };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  return <Storefront key={slug} requestedSlug={slug} />;
}
