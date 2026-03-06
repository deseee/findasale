import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';
import Layout from '../../components/Layout';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  purchaseCount: number;
  saleCount: number;
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ userId: string; newRole: string } | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1);
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

  if (isLoading || loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-warm-600">Loading users...</div>
        </div>
      </Layout>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return null;
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-warm-900 mb-2">Manage Users</h1>
          <p className="text-warm-600">Search, filter, and manage user roles</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Search and Filter */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-4 md:flex-row md:gap-4">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 border border-warm-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
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
        </div>

        {/* Users Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-warm-50 border-b border-warm-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900">Role</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900">Purchases</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900">Sales</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900">Joined</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-warm-50">
                    <td className="px-6 py-4 text-sm text-warm-900 font-medium">{u.name}</td>
                    <td className="px-6 py-4 text-sm text-warm-600">{u.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block px-3 py-1 rounded text-xs font-medium ${
                        u.role === 'ADMIN' ? 'bg-red-100 text-red-700' :
                        u.role === 'ORGANIZER' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600">{u.purchaseCount}</td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600">{u.saleCount}</td>
                    <td className="px-6 py-4 text-sm text-warm-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      <select
                        value={u.role}
                        onChange={(e) => setConfirmDialog({ userId: u.id, newRole: e.target.value })}
                        disabled={updatingRole === u.id}
                        className="px-2 py-1 border border-warm-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-amber-600"
                      >
                        <option value="USER">User</option>
                        <option value="ORGANIZER">Organizer</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-8 text-warm-500">
              No users found
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
                    ? 'bg-amber-600 text-white'
                    : 'bg-warm-200 text-warm-900 hover:bg-warm-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Confirmation Dialog */}
        {confirmDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-bold text-warm-900 mb-4">Change User Role</h3>
              <p className="text-warm-600 mb-6">
                Are you sure you want to change this user's role to <strong>{confirmDialog.newRole}</strong>?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 border border-warm-300 rounded-md text-warm-900 hover:bg-warm-50"
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
      </div>
    </Layout>
  );
};

export default AdminUsers;
