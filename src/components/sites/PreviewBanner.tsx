/**
 * The strip that stops a preview being mistaken for a live site. Only ever
 * rendered to a signed-in admin looking at a non-ACTIVE client's pages.
 */
export default function PreviewBanner({ status }: { status: string }) {
  return (
    <div className="sticky top-0 z-[100] bg-amber-500 text-black text-center text-sm font-bold py-1.5 px-4">
      PREVIEW — this site is {status === 'PAUSED' ? 'paused' : 'not live yet'}. Only admins can see
      it; visitors get an &ldquo;unavailable&rdquo; page until the client is set ACTIVE.
    </div>
  )
}
