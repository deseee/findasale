import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  purchaseCount: number;
  saleCount: number;
  oauthProvider: string | null;
  emailVerified: boolean;
  storefrontSlug: string | null;
  suspendedAt: string | null;
  deletedAt: string | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const AdminUsers = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [hideScraped, setHideScraped] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ userId: string; newRole: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchUsers = async (p = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', p.toString());
      if (search) params.append('search', search);
      if (roleFilter) params.append('role', roleFilter);
      if (hideScraped) params.append('hideScraped', 'true');

      const res = await api.get(`/admin/users?${params.toString()}`);
      setUsers(res.data.users);
      setPagination(res.data.pagination);
      setPage(p);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchUsers(1);
    }
  }, [user]);

  // Re-fetch when hideZeroActivity changes
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchUsers(1);
    }
  }, [hideScraped]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1);
  };

  const handleRowClick = (u: User) => {
    router.push(`/admin/users/${u.id}`);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      setUpdatingRole(userId);
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      setConfirmDialog(null);
    } catch (err) {
      console.error('Error updating role:', err);
      setError('Failed to update user role');
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleSuspendToggle = async (u: User) => {
    try {
      setActionLoading(u.id);
      if (u.suspendedAt) {
        await api.patch(`/admin/users/${u.id}/unsuspend`);
        setUsers(users.map(x => x.id === u.id ? { ...x, suspendedAt: null } : x));
      } else {
        await api.patch(`/admin/users/${u.id}/suspend`, { suspendReason: 'ADMIN_ACTION' });
        setUsers(users.map(x => x.id === u.id ? { ...x, suspendedAt: new Date().toISOString() } : x));
      }
    } catch (err) {
      console.error('Error toggling suspension:', err);
      setError('Failed to update suspension status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      setActionLoading(userId);
      await api.delete(`/admin/users/${userId}`);
      setUsers(users.map(u => u.id === userId ? { ...u, deletedAt: new Date().toISOString() } : u));
      setDeleteDialog(null);
    } catch (err) {
      console.error('Error deleting user:', err);
      setError('Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestore = async (userId: string) => {
    try {
      setActionLoading(userId);
      await api.patch(`/admin/users/${userId}/restore`);
      setUsers(users.map(u => u.id === userId ? { ...u, deletedAt: null } : u));
    } catch (err) {
      console.error('Error restoring user:', err);
      setError('Failed to restore user');
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading users...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Manage Users</h1>
          <p className="text-warm-600 dark:text-warm-400">Search, filter, and manage user roles. Click any row to view full profile.</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Search and Filter */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-4 md:flex-row md:items-center md:gap-4">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              aria-label="Search by name or email..."
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            >
              <option value="">All Roles</option>
              <option value="USER">User</option>
              <option value="ORGANIZER">Organizer</option>
              <option value="ADMIN">Admin</option>
            </select>

            <button
              type="submit"
              className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition"
            >
              Search
            </button>
          </form>

          {/* Zero-activity filter toggle */}
          <div className="mt-4 flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-warm-700 dark:text-warm-300">
              <input
                type="checkbox"
                checked={hideScraped}
                onChange={(e) => setHideScraped(e.target.checked)}
                className="w-4 h-4 rounded border-warm-300 text-amber-600 focus:ring-amber-600"
              />
              Hide scraped organizers
              <span className="text-warm-500 dark:text-warm-500 text-xs">(unmanaged listings imported by scrapers — not real registered users)</span>
            </label>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Role</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Auth</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Purchases</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Sales</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Joined</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {users.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => handleRowClick(u)}
                    className={`hover:bg-amber-50 dark:hover:bg-gray-700 cursor-pointer ${
                      u.deletedAt ? 'opacity-50 bg-red-50 dark:bg-red-900/10' : 'dark:bg-gray-900'
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">
                      <span className="flex items-center gap-2 flex-wrap">
                        {u.name}
                        {!u.emailVerified && (
                          <span className="text-xs text-orange-500 dark:text-orange-400" title="Email not verified">●</span>
                        )}
                        {u.suspendedAt && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">Suspended</span>
                        )}
                        {u.deletedAt && (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Deleted</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{u.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block px-3 py-1 rounded text-xs font-medium ${
                        u.role === 'ADMIN' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                        u.role === 'ORGANIZER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                      {u.oauthProvider ? (
                        <span className="capitalize">{u.oauthProvider}</span>
                      ) : (
                        <span className="text-warm-400 dark:text-warm-500">email</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">{u.purchaseCount}</td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">
                      {u.saleCount > 0 && u.storefrontSlug ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/organizer/storefront/${u.storefrontSlug}`, '_blank');
                          }}
                          className="text-amber-600 hover:underline"
                          title="View storefront"
                        >
                          {u.saleCount}
                        </button>
                      ) : (
                        u.saleCount
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-center flex-wrap">
                        <select
                          value={u.role}
                          onChange={(e) => setConfirmDialog({ userId: u.id, newRole: e.target.value })}
                          disabled={updatingRole === u.id}
                          className="px-2 py-1 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded text-xs focus:outline-none focus:ring-2 focus:ring-amber-600"
                        >
                          <option value="USER">User</option>
                          <option value="ORGANIZER">Organizer</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        {u.deletedAt ? (
                          <button
                            onClick={() => handleRestore(u.id)}
                            disabled={actionLoading === u.id}
                            className="px-2 py-1 text-xs rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50"
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSuspendToggle(u)}
                              disabled={actionLoading === u.id}
                              className={`px-2 py-1 text-xs rounded disabled:opacity-50 ${
                                u.suspendedAt
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
                              }`}
                            >
                              {u.suspendedAt ? 'Unsuspend' : 'Suspend'}
                            </button>
                            <button
                              onClick={() => setDeleteDialog(u.id)}
                              disabled={actionLoading === u.id}
                              className="px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8">
              <p className="text-warm-600 dark:text-gray-400">No users match your search or filters.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => fetchUsers(p)}
                className={`px-3 py-1 rounded ${
                  p === page
                    ? 'bg-amber-600 dark:bg-amber-700 text-white'
                    : 'bg-warm-200 dark:bg-gray-700 text-warm-900 dark:text-gray-300 hover:bg-warm-300 dark:hover:bg-gray-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Role Change Confirmation Dialog */}
        {confirmDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Change User Role</h3>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Are you sure you want to change this user&apos;s role to <strong>{confirmDialog.newRole}</strong>?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRoleChange(confirmDialog.userId, confirmDialog.newRole)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Delete User Account</h3>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Are you sure you want to delete this account? This can be reversed.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteDialog(null)}
                  className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteDialog)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export default AdminUsers;
