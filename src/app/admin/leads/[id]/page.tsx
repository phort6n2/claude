'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  Building2,
  ExternalLink,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  Save,
  Loader2,
  Trash2,
  Globe,
  Tag,
  MousePointer,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Lead {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  status: string
  source: string
  gclid: string | null
  gbraid: string | null
  wbraid: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmKeyword: string | null
  utmMatchtype: string | null
  campaignId: string | null
  adGroupId: string | null
  adId: string | null
  landingPageUrl: string | null
  formName: string | null
  formData: Record<string, unknown> | null
  highlevelContactId: string | null
  qualified: boolean | null
  qualificationNotes: string | null
  saleValue: number | null
  saleDate: string | null
  saleNotes: string | null
  enhancedConversionSent: boolean
  offlineConversionSent: boolean
  createdAt: string
  updatedAt: string
  client: {
    id: string
    businessName: string
    slug: string
    phone: string
    email: string
  }
}

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'New', icon: Clock, color: 'bg-blue-100 text-blue-800' },
  { value: 'CONTACTED', label: 'Contacted', icon: MessageSquare, color: 'bg-yellow-100 text-yellow-800' },
  { value: 'QUALIFIED', label: 'Qualified', icon: CheckCircle2, color: 'bg-green-100 text-green-800' },
  { value: 'UNQUALIFIED', label: 'Unqualified', icon: XCircle, color: 'bg-gray-100 text-gray-800' },
  { value: 'QUOTED', label: 'Quoted', icon: DollarSign, color: 'bg-purple-100 text-purple-800' },
  { value: 'SOLD', label: 'Sold', icon: TrendingUp, color: 'bg-emerald-100 text-emerald-800' },
  { value: 'LOST', label: 'Lost', icon: XCircle, color: 'bg-red-100 text-red-800' },
]

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const leadId = params.id as string

  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Editable fields
  const [status, setStatus] = useState('')
  const [saleValue, setSaleValue] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [saleNotes, setSaleNotes] = useState('')
  const [qualificationNotes, setQualificationNotes] = useState('')

  // Load lead
  useEffect(() => {
    fetch(`/api/leads/${leadId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          console.error(data.error)
          return
        }
        setLead(data)
        setStatus(data.status)
        setSaleValue(data.saleValue?.toString() || '')
        setSaleDate(data.saleDate ? data.saleDate.split('T')[0] : '')
        setSaleNotes(data.saleNotes || '')
        setQualificationNotes(data.qualificationNotes || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [leadId])

  async function handleSave() {
    setSaving(true)
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          saleValue: saleValue ? parseFloat(saleValue) : null,
          saleDate: saleDate || null,
          saleNotes: saleNotes || null,
          qualificationNotes: qualificationNotes || null,
        }),
      })

      if (response.ok) {
        const updated = await response.json()
        setLead(updated)
      }
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this lead?')) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        router.push('/admin/leads')
      }
    } catch (error) {
      console.error('Failed to delete:', error)
    } finally {
      setDeleting(false)
    }
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

  function formatPhone(phone: string) {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    return phone
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Lead not found</p>
          <Link href="/admin/leads">
            <Button>Back to Leads</Button>
          </Link>
        </div>
      </div>
    )
  }

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown Contact'
  const hasChanges =
    status !== lead.status ||
    saleValue !== (lead.saleValue?.toString() || '') ||
    saleDate !== (lead.saleDate ? lead.saleDate.split('T')[0] : '') ||
    saleNotes !== (lead.saleNotes || '') ||
    qualificationNotes !== (lead.qualificationNotes || '')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/admin/leads"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Leads
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
              <p className="text-gray-600">{lead.client.businessName}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
              <Button onClick={handleSave} disabled={saving || !hasChanges}>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Info */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Contact Information</h2>
              <div className="space-y-3">
                {lead.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-gray-400" />
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">
                      {lead.email}
                    </a>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-gray-400" />
                    <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">
                      {formatPhone(lead.phone)}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <span className="text-gray-600">Received {formatDate(lead.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-gray-400" />
                  <Link href={`/admin/clients/${lead.client.id}`} className="text-blue-600 hover:underline">
                    {lead.client.businessName}
                  </Link>
                </div>
              </div>
            </div>

            {/* Status & Sale Info */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Lead Status</h2>

              {/* Status Selector */}
              <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mb-6">
                {STATUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const isSelected = status === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setStatus(opt.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className={`text-xs font-medium ${isSelected ? 'text-blue-600' : 'text-gray-600'}`}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Sale Info (show when status is SOLD or QUOTED) */}
              {(status === 'SOLD' || status === 'QUOTED') && (
                <div className="border-t pt-4 mt-4 space-y-4">
                  <h3 className="font-medium text-gray-900">Sale Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sale Value ($)
                      </label>
                      <input
                        type="number"
                        value={saleValue}
                        onChange={(e) => setSaleValue(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sale Date
                      </label>
                      <input
                        type="date"
                        value={saleDate}
                        onChange={(e) => setSaleDate(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sale Notes
                    </label>
                    <textarea
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      placeholder="Add any notes about this sale..."
                      rows={2}
                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Qualification Notes */}
              <div className="border-t pt-4 mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={qualificationNotes}
                  onChange={(e) => setQualificationNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Form Data */}
            {lead.formData && Object.keys(lead.formData).length > 0 && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Form Submission Data</h2>
                <div className="space-y-2">
                  {Object.entries(lead.formData).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-sm font-medium text-gray-500 min-w-[120px]">
                        {key.replace(/_/g, ' ')}:
                      </span>
                      <span className="text-sm text-gray-900">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Google Ads Info */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" />
                Google Ads Tracking
              </h2>

              {lead.gclid ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    GCLID captured
                  </div>

                  {lead.utmCampaign && (
                    <div className="text-sm">
                      <span className="text-gray-500">Campaign:</span>
                      <span className="ml-2 text-gray-900">{lead.utmCampaign}</span>
                    </div>
                  )}
                  {lead.utmKeyword && (
                    <div className="text-sm">
                      <span className="text-gray-500">Keyword:</span>
                      <span className="ml-2 text-gray-900">{lead.utmKeyword}</span>
                    </div>
                  )}
                  {lead.utmMatchtype && (
                    <div className="text-sm">
                      <span className="text-gray-500">Match Type:</span>
                      <span className="ml-2 text-gray-900">{lead.utmMatchtype}</span>
                    </div>
                  )}

                  <div className="border-t pt-3 mt-3">
                    <div className="text-sm">
                      <span className="text-gray-500">Enhanced Conversion:</span>
                      <span className={`ml-2 ${lead.enhancedConversionSent ? 'text-green-600' : 'text-gray-400'}`}>
                        {lead.enhancedConversionSent ? 'Sent' : 'Pending'}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">Offline Conversion:</span>
                      <span className={`ml-2 ${lead.offlineConversionSent ? 'text-green-600' : 'text-gray-400'}`}>
                        {lead.offlineConversionSent ? 'Sent' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  <p>No GCLID - this lead may not be from Google Ads, or GCLID wasn&apos;t captured.</p>
                </div>
              )}
            </div>

            {/* Source Info */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MousePointer className="h-5 w-5 text-gray-500" />
                Lead Source
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500">Source:</span>
                  <span className="ml-2 text-gray-900">{lead.source}</span>
                </div>
                {lead.formName && (
                  <div>
                    <span className="text-gray-500">Form:</span>
                    <span className="ml-2 text-gray-900">{lead.formName}</span>
                  </div>
                )}
                {lead.landingPageUrl && (
                  <div>
                    <span className="text-gray-500">Landing Page:</span>
                    <a
                      href={lead.landingPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {lead.highlevelContactId && (
                  <div>
                    <span className="text-gray-500">HighLevel ID:</span>
                    <span className="ml-2 text-gray-900 font-mono text-xs">{lead.highlevelContactId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
