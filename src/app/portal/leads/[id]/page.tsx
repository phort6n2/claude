'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone,
  Mail,
  Calendar,
  ArrowLeft,
  Save,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  Loader2,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Lead {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  status: string
  statusUpdatedAt: string | null
  source: string
  formName: string | null
  saleValue: number | null
  saleCurrency: string
  saleDate: string | null
  saleNotes: string | null
  createdAt: string
  updatedAt: string
}

interface Session {
  authenticated: boolean
  clientName?: string
  userEmail?: string
}

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'New', color: 'bg-blue-100 text-blue-800', icon: Clock },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-yellow-100 text-yellow-800', icon: MessageSquare },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  { value: 'UNQUALIFIED', label: 'Unqualified', color: 'bg-gray-100 text-gray-800', icon: XCircle },
  { value: 'QUOTED', label: 'Quoted', color: 'bg-purple-100 text-purple-800', icon: DollarSign },
  { value: 'SOLD', label: 'Sold', color: 'bg-emerald-100 text-emerald-800', icon: TrendingUp },
  { value: 'LOST', label: 'Lost', color: 'bg-red-100 text-red-800', icon: XCircle },
]

export default function PortalLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [status, setStatus] = useState('')
  const [saleValue, setSaleValue] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [saleNotes, setSaleNotes] = useState('')

  // Check session
  useEffect(() => {
    fetch('/api/portal/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push('/portal/login')
        } else {
          setSession(data)
        }
      })
      .catch(() => {
        router.push('/portal/login')
      })
  }, [router])

  // Load lead data
  useEffect(() => {
    if (!session?.authenticated) return

    fetch(`/api/portal/leads/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Lead not found')
        return res.json()
      })
      .then((data) => {
        setLead(data)
        setStatus(data.status)
        setSaleValue(data.saleValue?.toString() || '')
        setSaleDate(data.saleDate ? data.saleDate.split('T')[0] : '')
        setSaleNotes(data.saleNotes || '')
      })
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [id, session])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch(`/api/portal/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          saleValue: saleValue ? parseFloat(saleValue) : null,
          saleDate: saleDate || null,
          saleNotes: saleNotes || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save')
      }

      const updated = await response.json()
      setLead((prev) => prev ? { ...prev, ...updated } : null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' })
    router.push('/portal/login')
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatPhoneDisplay(phone: string) {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    return phone
  }

  if (!session?.authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error && !lead) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/portal/leads" className="text-blue-600 hover:underline">
            Back to leads
          </Link>
        </div>
      </div>
    )
  }

  if (!lead) return null

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/portal/leads"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{session.clientName}</h1>
              <p className="text-sm text-gray-500">Lead Details</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Contact Info Card */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{fullName}</h2>

          <div className="grid md:grid-cols-2 gap-4">
            {lead.email && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">
                    {lead.email}
                  </a>
                </div>
              </div>
            )}

            {lead.phone && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                  <Phone className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <a href={`tel:${lead.phone}`} className="text-green-600 hover:underline">
                    {formatPhoneDisplay(lead.phone)}
                  </a>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <Calendar className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Received</p>
                <p className="text-gray-900">{formatDate(lead.createdAt)}</p>
              </div>
            </div>

            {lead.formName && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Source</p>
                  <p className="text-gray-900">{lead.formName}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status & Sale Info Card */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Lead</h3>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Saved successfully
            </div>
          )}

          {/* Status Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {STATUS_OPTIONS.map((option) => {
                const Icon = option.icon
                const isSelected = status === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 ' + option.color
                        : 'border-transparent ' + option.color.replace('-100', '-50')
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Sale Information */}
          <div className="border-t pt-6">
            <h4 className="text-sm font-medium text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Sale Information
            </h4>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Sale Value ($)</label>
                <input
                  type="number"
                  value={saleValue}
                  onChange={(e) => setSaleValue(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Sale Date</label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-600 mb-1">Notes</label>
              <textarea
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="Add any notes about this sale..."
                rows={3}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Help text */}
        <p className="mt-4 text-sm text-gray-500 text-center">
          Updating status and sale information helps us optimize your advertising campaigns.
        </p>
      </div>
    </div>
  )
}
