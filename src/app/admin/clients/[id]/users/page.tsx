'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Mail,
  User,
  Calendar,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Key,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ClientUser {
  id: string
  email: string
  name: string | null
  hasPassword: boolean
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

interface Client {
  id: string
  businessName: string
}

export default function ClientUsersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [users, setUsers] = useState<ClientUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New user form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Password reset
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  // Load client and users
  useEffect(() => {
    async function load() {
      try {
        const [clientRes, usersRes] = await Promise.all([
          fetch(`/api/clients/${id}`),
          fetch(`/api/clients/${id}/users`),
        ])

        if (!clientRes.ok) {
          throw new Error('Client not found')
        }

        const clientData = await clientRes.json()
        const usersData = await usersRes.json()

        setClient(clientData)
        setUsers(Array.isArray(usersData) ? usersData : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [id])

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError(null)

    if (!newPassword || newPassword.length < 6) {
      setAddError('Password must be at least 6 characters')
      setAdding(false)
      return
    }

    try {
      const response = await fetch(`/api/clients/${id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          name: newName || null,
          password: newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setUsers((prev) => [data, ...prev])
      setNewEmail('')
      setNewName('')
      setNewPassword('')
      setShowAddForm(false)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setAdding(false)
    }
  }

  async function handleSetPassword(userId: string) {
    if (!resetPassword || resetPassword.length < 6) {
      alert('Password must be at least 6 characters')
      return
    }

    try {
      const response = await fetch(`/api/clients/${id}/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })

      if (!response.ok) {
        throw new Error('Failed to set password')
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, hasPassword: true } : u))
      )
      setSettingPasswordFor(null)
      setResetPassword('')
      alert('Password updated successfully')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to set password')
    }
  }

  async function handleToggleActive(userId: string, currentActive: boolean) {
    try {
      const response = await fetch(`/api/clients/${id}/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      })

      if (!response.ok) {
        throw new Error('Failed to update')
      }

      const updated = await response.json()
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isActive: updated.isActive } : u))
      )
    } catch (err) {
      console.error('Toggle failed:', err)
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      const response = await fetch(`/api/clients/${id}/users/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
          <Link href="/admin/clients" className="text-blue-600 hover:underline mt-4 inline-block">
            Back to clients
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/admin/clients/${id}`}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client?.businessName}</h1>
            <p className="text-gray-600">Portal Users</p>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            Portal users can log in at <strong>glassleads.app/portal/login</strong> to view and manage leads for this client.
          </p>
        </div>

        {/* Add User Button/Form */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          {showAddForm ? (
            <form onSubmit={handleAddUser}>
              <h3 className="font-semibold text-gray-900 mb-4">Add Portal User</h3>

              {addError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {addError}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    placeholder="user@company.com"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name (optional)
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Min 6 characters"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none md:max-w-xs"
                />
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={adding}>
                  {adding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add User
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false)
                    setNewEmail('')
                    setNewName('')
                    setNewPassword('')
                    setAddError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Portal User
            </Button>
          )}
        </div>

        {/* Users List */}
        <div className="bg-white rounded-lg border overflow-hidden">
          {users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No portal users yet</p>
              <p className="text-sm mt-1">Add a user to give them access to the lead portal</p>
            </div>
          ) : (
            <div className="divide-y">
              {users.map((user) => (
                <div key={user.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          user.isActive ? 'bg-blue-100' : 'bg-gray-100'
                        }`}
                      >
                        <User
                          className={`h-5 w-5 ${user.isActive ? 'text-blue-600' : 'text-gray-400'}`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {user.name || user.email}
                          </span>
                          {!user.isActive && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5" />
                            {user.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Added {formatDate(user.createdAt)}
                          </span>
                          {user.lastLoginAt && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Last login {formatDate(user.lastLoginAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {settingPasswordFor === user.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            placeholder="New password"
                            className="w-32 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSetPassword(user.id)}
                          >
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSettingPasswordFor(null)
                              setResetPassword('')
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSettingPasswordFor(user.id)}
                          title={user.hasPassword ? 'Reset password' : 'Set password'}
                        >
                          <Key className="h-4 w-4 mr-1" />
                          {user.hasPassword ? 'Reset' : 'Set'} Password
                        </Button>
                      )}
                      <button
                        onClick={() => handleToggleActive(user.id, user.isActive)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title={user.isActive ? 'Deactivate user' : 'Activate user'}
                      >
                        {user.isActive ? (
                          <ToggleRight className="h-5 w-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
