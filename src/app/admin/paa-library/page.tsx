'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Star,
  FileText,
  X,
  Check,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  PageContainer,
  PageHeader,
  GradientStatCard,
  StatCardGrid,
  ContentCard,
  EmptyState,
  ListPageSkeleton,
} from '@/components/ui/theme'

interface PAAQuestion {
  id: string
  question: string
  service: string
  priority: number
  category: string | null
  isActive: boolean
  createdAt: string
  _count?: {
    contentItems: number
  }
}

interface PAAListResponse {
  questions: PAAQuestion[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    services: string[]
    categories: string[]
  }
}

export default function PAALibraryPage() {
  const [questions, setQuestions] = useState<PAAQuestion[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  })
  const [filters, setFilters] = useState({
    services: [] as string[],
    categories: [] as string[],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedPriority, setSelectedPriority] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<PAAQuestion | null>(null)
  const [modalForm, setModalForm] = useState({
    question: '',
    service: '',
    priority: 100,
    category: '',
    isActive: true,
  })
  const [saving, setSaving] = useState(false)

  const fetchQuestions = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', '50')

    if (searchQuery) params.set('search', searchQuery)
    if (selectedService) params.set('service', selectedService)
    if (selectedCategory) params.set('category', selectedCategory)
    if (selectedPriority) params.set('priority', selectedPriority)

    try {
      const response = await fetch(`/api/paa-library?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch questions')

      const data: PAAListResponse = await response.json()
      setQuestions(data.questions)
      setPagination(data.pagination)
      setFilters(data.filters)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedService, selectedCategory, selectedPriority])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchQuestions(1)
  }

  const openCreateModal = () => {
    setEditingQuestion(null)
    setModalForm({
      question: '',
      service: filters.services[0] || 'windshield replacement',
      priority: 100,
      category: '',
      isActive: true,
    })
    setShowModal(true)
  }

  const openEditModal = (question: PAAQuestion) => {
    setEditingQuestion(question)
    setModalForm({
      question: question.question,
      service: question.service,
      priority: question.priority,
      category: question.category || '',
      isActive: question.isActive,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      const url = editingQuestion
        ? `/api/paa-library/${editingQuestion.id}`
        : '/api/paa-library'

      const response = await fetch(url, {
        method: editingQuestion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...modalForm,
          category: modalForm.category || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save question')
      }

      setShowModal(false)
      fetchQuestions(pagination.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (question: PAAQuestion) => {
    if (!confirm(`Delete "${question.question}"?`)) return

    try {
      const response = await fetch(`/api/paa-library/${question.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete')
      }

      fetchQuestions(pagination.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const getPriorityBadge = (priority: number) => {
    if (priority <= 10) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg">
          <Star size={12} className="fill-current" />
          High ({priority})
        </span>
      )
    }
    return (
      <span className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg">
        {priority}
      </span>
    )
  }

  // Calculate stats
  const highPriorityCount = questions.filter(q => q.priority <= 10).length
  const activeCount = questions.filter(q => q.isActive).length

  if (loading && questions.length === 0) {
    return <ListPageSkeleton />
  }

  return (
    <PageContainer>
      <PageHeader
        title="PAA Question Library"
        subtitle={`${pagination.total} questions across ${filters.services.length} services`}
        backHref="/admin/settings"
        actions={
          <Button onClick={openCreateModal} className="shadow-lg shadow-blue-500/25">
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </Button>
        }
      />

      {/* Stats Cards */}
      <StatCardGrid cols={4}>
        <GradientStatCard
          title="Total Questions"
          value={pagination.total}
          subtitle="In library"
          icon={<HelpCircle />}
          variant="blue"
        />
        <GradientStatCard
          title="Services"
          value={filters.services.length}
          subtitle="Categories"
          icon={<FileText />}
          variant="violet"
        />
        <GradientStatCard
          title="High Priority"
          value={highPriorityCount}
          subtitle="Priority 1-10"
          icon={<Star />}
          variant="amber"
        />
        <GradientStatCard
          title="Active"
          value={activeCount}
          subtitle="Available for use"
          icon={<Sparkles />}
          variant="green"
        />
      </StatCardGrid>

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[250px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-all ${
              showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <Button type="submit" className="rounded-xl">
            Search
          </Button>
        </form>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Service
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">All Services</option>
                {filters.services.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">All Categories</option>
                {filters.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Priority
              </label>
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">All Priorities</option>
                <option value="high">High Priority (1-10)</option>
                <option value="regular">Regular (11+)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Questions Table */}
      <ContentCard padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Question
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Service
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">
                  Category
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                  Status
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : questions.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<HelpCircle />}
                      title="No questions found"
                      description="Try adjusting your filters or add a new question"
                    />
                  </td>
                </tr>
              ) : (
                questions.map((question) => (
                  <tr key={question.id} className={`group hover:bg-gray-50 transition-colors ${!question.isActive ? 'bg-gray-50/50' : ''}`}>
                    <td className="px-4 py-3.5">
                      <span className={`text-sm ${!question.isActive ? 'text-gray-400' : 'text-gray-900'}`}>
                        {question.question}
                      </span>
                      {question._count && question._count.contentItems > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                          <FileText size={12} />
                          {question._count.contentItems} content items
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                        {question.service}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-gray-600">{question.category || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">{getPriorityBadge(question.priority)}</td>
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      {question.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-lg">
                          <Check size={12} />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-lg">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(question)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(question)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} questions
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchQuestions(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 border border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-gray-600 px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchQuestions(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 border border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </ContentCard>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingQuestion ? 'Edit Question' : 'Add New Question'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Question Template
                </label>
                <textarea
                  value={modalForm.question}
                  onChange={(e) => setModalForm({ ...modalForm, question: e.target.value })}
                  rows={3}
                  placeholder="How much does {service} cost in {location}?"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Use {'{location}'} as a placeholder for client location
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Service
                  </label>
                  <select
                    value={modalForm.service}
                    onChange={(e) => setModalForm({ ...modalForm, service: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    {filters.services.length > 0 ? (
                      filters.services.map((service) => (
                        <option key={service} value={service}>
                          {service}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="windshield replacement">windshield replacement</option>
                        <option value="rock chip repair">rock chip repair</option>
                        <option value="ADAS calibration">ADAS calibration</option>
                        <option value="side window replacement">side window replacement</option>
                        <option value="rear window replacement">rear window replacement</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Category
                  </label>
                  <input
                    type="text"
                    value={modalForm.category}
                    onChange={(e) => setModalForm({ ...modalForm, category: e.target.value })}
                    placeholder="e.g., cost, process, safety"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Priority (1-200)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={modalForm.priority}
                    onChange={(e) => setModalForm({ ...modalForm, priority: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">1-10 = High priority</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Status
                  </label>
                  <label className="inline-flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalForm.isActive}
                      onChange={(e) => setModalForm({ ...modalForm, isActive: e.target.checked })}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !modalForm.question || !modalForm.service}
                className="rounded-xl"
              >
                {saving ? 'Saving...' : editingQuestion ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
