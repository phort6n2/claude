'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Phone,
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
  MousePointer,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Code,
  Zap,
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  NEW: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  CONTACTED: { label: 'Contacted', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: MessageSquare },
  QUOTED: { label: 'Quoted', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: DollarSign },
  SOLD: { label: 'Sold', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: TrendingUp },
  LOST: { label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
}

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}))

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const leadId = params.id as string

  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Editable fields
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editSaleValue, setEditSaleValue] = useState('')
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editSaleNotes, setEditSaleNotes] = useState('')

  // Expandable sections for troubleshooting
  const [showRawData, setShowRawData] = useState(false)
  const [showUtmParams, setShowUtmParams] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [retrySuccess, setRetrySuccess] = useState(false)

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

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
        setEditFirstName(data.firstName || '')
        setEditLastName(data.lastName || '')
        setEditEmail(data.email || '')
        setEditPhone(data.phone || '')
        setEditStatus(data.status)
        setEditSaleValue(data.saleValue?.toString() || '')
        setEditSaleDate(data.saleDate ? data.saleDate.split('T')[0] : '')
        setEditSaleNotes(data.saleNotes || '')
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
          firstName: editFirstName || null,
          lastName: editLastName || null,
          email: editEmail || null,
          phone: editPhone || null,
          status: editStatus,
          saleValue: editSaleValue ? parseFloat(editSaleValue) : null,
          saleDate: editSaleDate || null,
          saleNotes: editSaleNotes || null,
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

  async function handleRetryConversion() {
    setRetrying(true)
    setRetryError(null)
    setRetrySuccess(false)

    try {
      const response = await fetch(`/api/leads/${leadId}/retry-conversion`, {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setRetrySuccess(true)
        // Update local state
        setLead((prev) => prev ? {
          ...prev,
          enhancedConversionSent: true,
        } : null)
        setTimeout(() => setRetrySuccess(false), 3000)
      } else {
        setRetryError(data.error || 'Failed to send conversion')
      }
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : 'Network error')
    } finally {
      setRetrying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
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
  const isPhoneLead = lead.source === 'PHONE'
  const fd = lead.formData as Record<string, unknown> | null
  const rawPayload = fd?._rawPayload as Record<string, unknown> | null

  // Helper to get field from formData or fall back to _rawPayload with various key formats
  const getField = (keys: string[]): string | null => {
    for (const key of keys) {
      if (fd?.[key]) return String(fd[key])
    }
    for (const key of keys) {
      if (rawPayload?.[key]) return String(rawPayload[key])
    }
    return null
  }

  // Extract fields with fallbacks for different key formats HighLevel uses
  const interestedIn = getField(['interested_in', 'Interested In:', 'Interested In'])
  const vehicleYear = getField(['vehicle_year', 'Vehicle Year', 'vehicleYear'])
  const vehicleMake = getField(['vehicle_make', 'Vehicle Make', 'vehicleMake'])
  const vehicleModel = getField(['vehicle_model', 'Vehicle Model', 'vehicleModel'])
  const vin = getField(['vin', 'VIN', 'Vin'])
  const glassType = getField(['glass_type', 'What type of glass do you need help with?', 'Glass Type'])
  const workDescription = getField(['work_description', 'Description of Work Needed', 'description'])
  const insuranceHelp = getField(['insurance_help', 'Would You Like Us To Help Navigate Your Insurance Claim For You?', 'radio_3s0t'])
  const postalCode = getField(['postal_code', 'postalCode'])

  const hasDetails = !!(interestedIn || vehicleYear || vehicleMake || vehicleModel || vin || glassType || workDescription || insuranceHelp || postalCode)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-40 rounded-b-2xl">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link
              href="/admin/leads"
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Leads
            </Link>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Phone lead indicator */}
            {isPhoneLead && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 flex items-center gap-2">
                <Phone className="h-4 w-4 text-orange-600" />
                <span className="text-sm text-orange-800 font-medium">Phone Call Lead</span>
              </div>
            )}

            {/* Contact Info */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Contact Info</h4>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(lead.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs text-gray-600 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Lead Details */}
            {hasDetails && (
              <div className="bg-blue-50 rounded-2xl p-4">
                <h4 className="font-medium text-gray-900 mb-3">Lead Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {interestedIn && (
                    <div>
                      <span className="text-gray-500">Interested In</span>
                      <p className="font-medium text-gray-900">{interestedIn}</p>
                    </div>
                  )}
                  {postalCode && (
                    <div>
                      <span className="text-gray-500">Zip Code</span>
                      <p className="font-medium text-gray-900">{postalCode}</p>
                    </div>
                  )}
                  {vehicleYear && (
                    <div>
                      <span className="text-gray-500">Year</span>
                      <p className="font-medium text-gray-900">{vehicleYear}</p>
                    </div>
                  )}
                  {vehicleMake && (
                    <div>
                      <span className="text-gray-500">Make</span>
                      <p className="font-medium text-gray-900">{vehicleMake}</p>
                    </div>
                  )}
                  {vehicleModel && (
                    <div>
                      <span className="text-gray-500">Model</span>
                      <p className="font-medium text-gray-900">{vehicleModel}</p>
                    </div>
                  )}
                  {vin && (
                    <div>
                      <span className="text-gray-500">VIN</span>
                      <p className="font-medium font-mono text-gray-900 text-xs break-all">{vin}</p>
                    </div>
                  )}
                  {insuranceHelp && (
                    <div>
                      <span className="text-gray-500">Insurance Help</span>
                      <p className="font-medium text-gray-900">{insuranceHelp}</p>
                    </div>
                  )}
                  {glassType && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Glass Type</span>
                      <p className="font-medium text-gray-900">{glassType}</p>
                    </div>
                  )}
                  {workDescription && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Work Description</span>
                      <p className="font-medium text-gray-900">{workDescription}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="bg-white rounded-2xl p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sale Value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Value
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="number"
                    value={editSaleValue}
                    onChange={(e) => setEditSaleValue(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </div>

              {/* Sale Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Date
                </label>
                <input
                  type="date"
                  value={editSaleDate}
                  onChange={(e) => setEditSaleDate(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={editSaleNotes}
                  onChange={(e) => setEditSaleNotes(e.target.value)}
                  placeholder="Add notes about this lead..."
                  rows={3}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900 resize-none placeholder:text-gray-500"
                />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Client Info */}
            <div className="bg-white rounded-2xl p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-500" />
                Client
              </h4>
              <Link href={`/admin/clients/${lead.client.id}`} className="text-blue-600 hover:underline text-sm">
                {lead.client.businessName}
              </Link>
            </div>

            {/* Conversion Tracking */}
            <div className="bg-white rounded-2xl p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Conversion Tracking
              </h4>

              <div className="space-y-3">
                {/* GCLID */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500">GCLID</span>
                    {lead.gclid ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600">
                        <XCircle className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  {lead.gclid ? (
                    <div className="flex items-center gap-1">
                      <code className="flex-1 text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-700 break-all">
                        {lead.gclid}
                      </code>
                      <button
                        onClick={() => copyToClipboard(lead.gclid!, 'gclid')}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Copy GCLID"
                      >
                        {copiedField === 'gclid' ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Not captured</p>
                  )}
                </div>

                {/* GBRAID */}
                {lead.gbraid && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">GBRAID (iOS)</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-700 break-all">
                        {lead.gbraid}
                      </code>
                      <button
                        onClick={() => copyToClipboard(lead.gbraid!, 'gbraid')}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Copy GBRAID"
                      >
                        {copiedField === 'gbraid' ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* WBRAID */}
                {lead.wbraid && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">WBRAID (Web-to-App)</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-700 break-all">
                        {lead.wbraid}
                      </code>
                      <button
                        onClick={() => copyToClipboard(lead.wbraid!, 'wbraid')}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Copy WBRAID"
                      >
                        {copiedField === 'wbraid' ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Conversion Status */}
                <div className="border-t pt-3 mt-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500 mb-2">Sync Status</p>

                  {/* Retry error/success messages */}
                  {retryError && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 mb-2">
                      {retryError}
                    </div>
                  )}
                  {retrySuccess && (
                    <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 mb-2 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Enhanced conversion sent successfully!
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Enhanced (Email/Phone):</span>
                    {lead.enhancedConversionSent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Sent
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          <Clock className="h-3 w-3" />
                          Pending
                        </span>
                        {lead.gclid && (lead.email || lead.phone) && (
                          <button
                            onClick={handleRetryConversion}
                            disabled={retrying}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                          >
                            {retrying ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Offline (Sale Value):</span>
                    {lead.offlineConversionSent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Sent
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* UTM Parameters (Expandable) */}
            <div className="bg-white rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowUtmParams(!showUtmParams)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-500" />
                  UTM Parameters
                </h4>
                {showUtmParams ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {showUtmParams && (
                <div className="px-4 pb-4 space-y-2 text-sm border-t">
                  <div className="pt-3 grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-gray-500">Source</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.utmSource || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Medium</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.utmMedium || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Campaign</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.utmCampaign || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Content</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.utmContent || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Keyword</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.utmKeyword || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Match Type</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.utmMatchtype || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Campaign ID</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.campaignId || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Ad Group ID</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.adGroupId || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Ad ID</span>
                      <p className="text-gray-900 font-mono text-xs">{lead.adId || '—'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lead Source */}
            <div className="bg-white rounded-2xl p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <MousePointer className="h-4 w-4 text-gray-500" />
                Source
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Type:</span>
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
                    <span className="text-gray-500">HighLevel:</span>
                    <span className="ml-2 text-gray-900 font-mono text-xs">{lead.highlevelContactId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Raw Webhook Data (Expandable) */}
            <div className="bg-white rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <Code className="h-4 w-4 text-purple-500" />
                  Raw Webhook Data
                </h4>
                {showRawData ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {showRawData && (
                <div className="px-4 pb-4 border-t">
                  <div className="pt-3">
                    {lead.formData && Object.keys(lead.formData).length > 0 ? (
                      <div className="space-y-3">
                        {/* Copy All Button */}
                        <div className="flex justify-end">
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(lead.formData, null, 2), 'formData')}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                          >
                            {copiedField === 'formData' ? (
                              <>
                                <Check className="h-3 w-3 text-green-600" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy JSON
                              </>
                            )}
                          </button>
                        </div>

                        {/* Individual Fields */}
                        <div className="space-y-2">
                          {Object.entries(lead.formData).map(([key, value]) => (
                            <div key={key} className="border-b border-gray-100 pb-2 last:border-0">
                              <span className="text-xs font-medium text-gray-500">{key}</span>
                              <div className="mt-0.5">
                                {typeof value === 'object' && value !== null ? (
                                  <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto font-mono text-gray-700">
                                    {JSON.stringify(value, null, 2)}
                                  </pre>
                                ) : (
                                  <p className="text-sm text-gray-900 font-mono break-all">
                                    {String(value)}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Full JSON View */}
                        <details className="mt-3">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                            View as JSON
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto font-mono">
                            {JSON.stringify(lead.formData, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No form data captured</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
