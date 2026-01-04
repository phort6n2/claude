'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/admin/Header'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ArrowLeft, Save, Loader2, FileQuestion, Check, AlertCircle } from 'lucide-react'
import { SAMPLE_PAAS } from '@/lib/sample-paas'

export default function StandardPaasPage() {
  const router = useRouter()
  const [paaText, setPaaText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [validation, setValidation] = useState({
    total: 0,
    valid: 0,
    invalid: 0,
    errors: [] as string[],
  })

  // Load existing standard PAAs
  useEffect(() => {
    fetch('/api/settings/standard-paas')
      .then((res) => res.json())
      .then((data) => {
        if (data.paas && Array.isArray(data.paas)) {
          const text = data.paas.map((paa: { question: string }) => paa.question).join('\n')
          setPaaText(text)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Validate as user types
  useEffect(() => {
    const lines = paaText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    let valid = 0
    let invalid = 0
    const errors: string[] = []

    for (const line of lines) {
      const hasLocation = /\{location\}/i.test(line)
      const hasQuestionMark = line.endsWith('?')

      if (hasLocation && hasQuestionMark) {
        valid++
      } else {
        invalid++
        const issues: string[] = []
        if (!hasLocation) issues.push('missing {location}')
        if (!hasQuestionMark) issues.push('missing ?')
        errors.push(`"${line.slice(0, 50)}..." - ${issues.join(', ')}`)
      }
    }

    setValidation({ total: lines.length, valid, invalid, errors })
  }, [paaText])

  const loadSampleQuestions = () => {
    setPaaText(SAMPLE_PAAS)
    setMessage(null)
  }

  const handleSave = async () => {
    if (validation.valid === 0) {
      setMessage({ type: 'error', text: 'No valid PAA questions to save' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/standard-paas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paaText }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Standard PAAs saved successfully' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save standard PAAs' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Standard PAA Questions" subtitle="Default questions used by all clients" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl">
          {/* Back Button */}
          <Button variant="outline" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileQuestion className="h-5 w-5 text-blue-600" />
                Standard PAA Questions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <strong>How Standard PAAs work:</strong>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>These are default questions available to ALL clients</li>
                  <li>Clients can add their own &quot;Custom PAAs&quot; which take priority</li>
                  <li>Once a client exhausts their Custom PAAs, Standard PAAs are used</li>
                  <li>Each question must include <code className="bg-blue-100 px-1 rounded">{'{location}'}</code> and end with <code className="bg-blue-100 px-1 rounded">?</code></li>
                </ul>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Enter PAA questions (one per line). These will be used by all clients.
                </p>
                <button
                  type="button"
                  onClick={loadSampleQuestions}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Load 100+ Sample Questions
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  <span className="ml-2 text-gray-500">Loading...</span>
                </div>
              ) : (
                <textarea
                  value={paaText}
                  onChange={(e) => setPaaText(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  rows={20}
                  placeholder={`What is the cost of windshield repair in {location}?\nHow long does auto glass replacement take in {location}?\nCan rock chips be repaired in {location}?`}
                />
              )}

              {/* Validation Status */}
              {validation.total > 0 && (
                <div className="flex items-center gap-4 text-sm">
                  {validation.valid > 0 && (
                    <span className="text-green-600 font-medium">
                      ✓ {validation.valid} valid
                    </span>
                  )}
                  {validation.invalid > 0 && (
                    <span className="text-amber-600 font-medium">
                      ⚠️ {validation.invalid} invalid
                    </span>
                  )}
                  <span className="text-gray-500">
                    ({validation.total} total questions)
                  </span>
                </div>
              )}

              {/* Error List */}
              {validation.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-800 mb-2">Issues to fix:</p>
                  <ul className="text-sm text-amber-700 space-y-1">
                    {validation.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {validation.errors.length > 5 && (
                      <li className="text-amber-600">
                        ... and {validation.errors.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Message */}
              {message && (
                <div className={`p-4 rounded-lg flex items-center gap-2 ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {message.type === 'success' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {message.text}
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSave}
                  disabled={saving || validation.valid === 0}
                  className="flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Standard PAAs ({validation.valid})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
