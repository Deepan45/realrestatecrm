"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/types";

interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
}

export default function BlogIndexPage() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: PostSummary[] }>("/blog").then((r) => setPosts(r.data)).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!posts) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Insights &amp; Guides</h1>
        <p className="mt-1 text-sm text-slate-500">Market trends, buying guides, and neighborhood spotlights.</p>
      </div>
      {posts.length === 0 ? (
        <Card><EmptyState message="No articles published yet — check back soon." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map((p) => (
            <Link key={p.id} href={`/blog/${p.slug}`}>
              <Card className="overflow-hidden transition hover:shadow-card-hover">
                {p.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverImageUrl} alt="" className="h-40 w-full object-cover" />
                )}
                <div className="p-4">
                  <h2 className="text-base font-semibold text-slate-800">{p.title}</h2>
                  {p.excerpt && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.excerpt}</p>}
                  <p className="mt-2 text-xs text-slate-400">{fmtDate(p.publishedAt)}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
