'use client'

import { ReactNode, useState } from 'react'

interface Tab {
  id: string
  label: string
  icon?: ReactNode
  count?: number
  content: ReactNode
}

interface TabGroupProps {
  tabs: Tab[]
  defaultTab?: string
  rightContent?: ReactNode
  maxHeight?: string
}

export function TabGroup({ tabs, defaultTab, rightContent, maxHeight = '500px' }: TabGroupProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)

  const activeContent = tabs.find(t => t.id === activeTab)?.content

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
            }`}
          >
            {tab.icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}

        {rightContent && <div className="ml-auto">{rightContent}</div>}
      </div>

      {/* Tab Content */}
      <div className="overflow-y-auto" style={{ maxHeight }}>
        {activeContent}
      </div>
    </div>
  )
}

// Simple inline tab navigation (no container)
interface InlineTabsProps {
  tabs: { id: string; label: string; icon?: ReactNode }[]
  activeTab: string
  onChange: (tabId: string) => void
}

export function InlineTabs({ tabs, activeTab, onChange }: InlineTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeTab === tab.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// List item for use inside tab content
interface TabListItemProps {
  children: ReactNode
  className?: string
}

export function TabListItem({ children, className = '' }: TabListItemProps) {
  return (
    <div className={`p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 ${className}`}>
      {children}
    </div>
  )
}
