export function PoweredByFooter() {
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-200 z-50">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-center gap-1.5">
          <span className="text-gray-400 text-xs">Powered by</span>
          <a
            href="https://autoglassmarketingpros.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:opacity-75 transition-opacity"
          >
            <img
              src="/logo.png"
              alt="Auto Glass Marketing Pros"
              className="h-4 w-auto"
            />
            <span className="text-gray-700 text-xs font-medium">
              Auto Glass Marketing Pros
            </span>
          </a>
        </div>
      </div>
      {/* Spacer so content doesn't sit under the fixed footer */}
      <div className="h-9" />
    </>
  )
}
