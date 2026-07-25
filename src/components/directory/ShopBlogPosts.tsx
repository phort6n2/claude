import { Rss, ArrowUpRight } from 'lucide-react'
import type { BlogPost } from '@/lib/directory/feed'

function fmtDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Latest posts from the shop's own blog (owner-configured feed). Titles link
// out to the shop's site — fresh content on the listing, and a reason for the
// owner to keep it current. Renders nothing when there are no posts.
export function ShopBlogPosts({ posts, shopName }: { posts: BlogPost[]; shopName: string }) {
  if (!posts.length) return null
  return (
    <>
      <h2 className="mt-10 flex items-center gap-2 text-xl font-bold text-gray-900">
        <Rss width={20} height={20} className="text-blue-600" /> Latest from {shopName}
      </h2>
      <div className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
        {posts.map((p) => {
          const date = fmtDate(p.date)
          return (
            <a
              key={p.link}
              href={p.link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <span className="min-w-0">
                <span className="block font-medium text-gray-900 group-hover:text-blue-600">
                  {p.title}
                </span>
                {date && <span className="mt-0.5 block text-xs text-gray-400">{date}</span>}
              </span>
              <ArrowUpRight
                width={16}
                height={16}
                className="mt-0.5 shrink-0 text-gray-300 group-hover:text-blue-600"
              />
            </a>
          )
        })}
      </div>
    </>
  )
}
