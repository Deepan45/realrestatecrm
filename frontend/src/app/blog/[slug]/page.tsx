"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { BlogPost, fmtDate } from "@/lib/types";
import BlogLeadForm from "@/components/BlogLeadForm";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: BlogPost }>(`/blog/${slug}`).then((r) => setPost(r.data)).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!post) return <Spinner />;

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <article className="lg:col-span-2">
        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImageUrl} alt="" className="mb-6 h-64 w-full rounded-2xl object-cover" />
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800">{post.title}</h1>
        <p className="mt-1 text-xs text-slate-400">
          {post.author?.name ? `${post.author.name} · ` : ""}{fmtDate(post.publishedAt)}
        </p>
        <div className="mt-6 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {post.body}
        </div>
      </article>
      <aside className="lg:sticky lg:top-8 lg:h-fit">
        <BlogLeadForm sourceTag={post.slug} />
      </aside>
    </div>
  );
}
