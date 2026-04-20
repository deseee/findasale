import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import Skeleton from '../../components/Skeleton';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerActivityFeed } from '../../hooks/useOrganizerActivityFeed';
import OrganizerActivityFeedCard from '../../components/OrganizerActivityFeedCard';
import MorningBriefing from '../../components/MorningBriefing';

interface WorkspaceMember {
  id: string;
  organizerId: string;
  role: string;
  acceptedAt: string | null;
  organizer?: {
    id: string;
    businessName: string;
    profilePhoto?: string;
    user?: { email: string };
  } | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface WorkspaceSale {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  city: string;
}

interface WorkspaceInternal {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  ownerId: string;       // Organizer ID
  ownerUserId: string;   // User ID — used for isOwner check
  ownerName: string;
  members: WorkspaceMember[];
  description?: string;
  upcomingSales?: WorkspaceSale[];
  pastSales?: WorkspaceSale[];
}

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  organizer: {
    id: string;
    businessName: string;
  };
}

interface WorkspaceTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  dueAt?: string;
  assignedTo?: string;
  assignedToInfo?: { id: string; businessName: string };
  createdAt: string;
  sale: { id: string; title: string };
}

interface TasksResponse {
  tasks: WorkspaceTask[];
}

export default function WorkspacePage() {
  const router = useRouter();
  const { slug } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { data: workspace, isLoading, isError } = useQuery({
    queryKey: ['workspace-internal', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await api.get(`/workspace/public/${slug}`);
      return data as WorkspaceInternal;
    },
    enabled: !!slug && !authLoading && !!user,
    retry: 1,
  });

  // Morning Briefing: fetch if workspace is loaded
  const { data: briefingData } = useQuery({
    queryKey: ['workspace-briefing', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return null;
      const { data } = await api.get(`/workspace/${workspace.id}/briefing`);
      return data as { briefing: any };
    },
    enabled: !!workspace?.id,
    refetchInterval: 60000, // Re-check every 60s in case sale enters briefing window
    retry: 1,
  });

  // Combine all sale IDs for activity feed
  const allSales = [
    ...(workspace?.upcomingSales || []),
    ...(workspace?.pastSales || []),
  ];
  const saleIds = allSales.map((s) => s.id);

  // Fetch activity feed
  const { data: activityData, isLoading: activityLoading } = useOrganizerActivityFeed(
    saleIds.length > 0 ? saleIds : undefined
  );

  // Chat state
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // View toggle: briefing vs dashboard
  const [forceDashboard, setForceDashboard] = useState(false);

  // Tasks state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSaleId, setNewTaskSaleId] = useState<string>('');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Auto-select first upcoming sale if available
  useEffect(() => {
    if (workspace?.upcomingSales && workspace.upcomingSales.length > 0 && !selectedSaleId) {
      setSelectedSaleId(workspace.upcomingSales[0].id);
    }
  }, [workspace?.upcomingSales, selectedSaleId]);

  // Fetch chat messages for selected sale
  const { data: chatData, isLoading: chatLoading, refetch: refetchChat } = useQuery({
    queryKey: ['workspace-sale-chat', workspace?.id, selectedSaleId],
    queryFn: async () => {
      if (!workspace?.id || !selectedSaleId) return null;
      const { data } = await api.get(`/workspace/${workspace.id}/sales/${selectedSaleId}/chat`);
      return data as { messages: ChatMessage[] };
    },
    enabled: !!workspace?.id && !!selectedSaleId,
    refetchInterval: 15000, // Poll every 15 seconds
    retry: 1,
  });

  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: ['workspace-tasks', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return null;
      const { data } = await api.get(`/workspace/${workspace.id}/tasks`);
      return data as TasksResponse;
    },
    enabled: !!workspace?.id,
    refetchInterval: 30000, // Poll every 30 seconds
    retry: 1,
  });

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatData?.messages]);

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !workspace?.id || !selectedSaleId) return;

    setIsSending(true);
    try {
      await api.post(`/workspace/${workspace.id}/sales/${selectedSaleId}/chat`, {
        message: messageInput,
      });
      setMessageInput('');
      // Refetch messages immediately
      await refetchChat();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Handle creating a task
  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !newTaskSaleId || !workspace?.id) return;

    setIsCreatingTask(true);
    try {
      await api.post(`/workspace/${workspace.id}/tasks`, {
        title: newTaskTitle,
        saleId: newTaskSaleId,
        assignedToId: newTaskAssignee || null,
      });
      setNewTaskTitle('');
      setNewTaskSaleId('');
      setNewTaskAssignee('');
      setShowAddTask(false);
      await refetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Handle toggling task status
  const handleToggleTaskStatus = async (task: WorkspaceTask) => {
    if (!workspace?.id) return;

    const statusCycle = { PENDING: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: 'PENDING' };
    const nextStatus = statusCycle[task.status as keyof typeof statusCycle] || 'PENDING';

    try {
      await api.patch(`/workspace/${workspace.id}/tasks/${task.id}`, {
        status: nextStatus,
      });
      await refetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/login?next=${encodeURIComponent(router.asPath)}`);
    }
  }, [user, authLoading, router]);

  if (authLoading || isLoading) {
    return (
      <>
        <Head>
          <title>Workspace | FindA.Sale</title>
        </Head>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-8 mb-4 w-1/2" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </>
    );
  }

  if (isError || !workspace) {
    return (
      <>
        <Head>
          <title>Workspace Not Found | FindA.Sale</title>
        </Head>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
            <h1 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Workspace Not Found
            </h1>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              We couldn't find the workspace you're looking for. You may not be a member of this workspace.
            </p>
            <a
              href="/organizer/dashboard"
              className="inline-block bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </>
    );
  }

  // Morning Briefing: if a qualifying sale exists and user hasn't toggled away, render briefing
  if (briefingData?.briefing && !forceDashboard) {
    return (
      <>
        <Head>
          <title>Day of — {workspace.name} | FindA.Sale</title>
          <meta name="description" content={`Morning briefing for ${workspace.name}`} />
        </Head>
        <MorningBriefing
          briefing={briefingData.briefing}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          onExitBriefing={() => setForceDashboard(true)}
        />
      </>
    );
  }

  const acceptedMembers = workspace.members.filter((m) => m.acceptedAt !== null);
  const isOwner = workspace.ownerUserId === user?.id;
  const createdDate = new Date(workspace.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <Head>
        <title>{workspace.name} Workspace | FindA.Sale</title>
        <meta name="description" content={`Team collaboration workspace for ${workspace.name}`} />
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Workspace Header */}
        <div className="mb-8 flex items-center justify-between">
          <a
            href="/organizer/dashboard"
            className="text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 text-sm font-medium inline-block"
          >
            ← Back to Dashboard
          </a>
          {briefingData?.briefing && forceDashboard && (
            <button
              onClick={() => setForceDashboard(false)}
              className="text-sm font-medium px-4 py-2 rounded-full bg-sage-600 text-white hover:bg-sage-700 transition"
            >
              Back to Day-of Briefing
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
              {workspace.name}
            </h1>
            <p className="text-warm-600 dark:text-warm-400">
              Team collaboration hub
            </p>
          </div>

          {/* Workspace Description */}
          {workspace.description && (
            <div className="mb-6 bg-warm-50 dark:bg-gray-700 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-warm-600 dark:text-warm-400 mb-2">
                About This Workspace
              </h3>
              <p className="text-warm-900 dark:text-warm-100 leading-relaxed">
                {workspace.description}
              </p>
            </div>
          )}

          {/* Workspace Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Team Members</p>
              <p className="text-2xl font-bold text-warm-900 dark:text-warm-100 mt-1">
                {acceptedMembers.length}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Workspace Owner</p>
              <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mt-1 truncate">
                {workspace.ownerName || 'Unknown'}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Created</p>
              <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mt-1">
                {createdDate}
              </p>
            </div>

            <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-warm-600 dark:text-warm-400 font-medium">Workspace ID</p>
              <p className="text-xs font-mono text-warm-900 dark:text-warm-100 mt-1 truncate">
                {workspace.id}
              </p>
            </div>
          </div>

        </div>

        {/* Two-column layout for team and activity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Team Members Section - Left Column (spans 1) */}
          <div className="md:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Team Members
              </h2>

              {/* Owner */}
              <div className="mb-4 pb-4 border-b border-warm-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sage-400 to-sage-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {(workspace.ownerName || 'O')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm">
                      {workspace.ownerName || 'Owner'}
                    </p>
                    <p className="text-xs text-warm-600 dark:text-warm-400">
                      Owner
                    </p>
                  </div>
                </div>
              </div>

              {/* Other Members */}
              {acceptedMembers.length > 0 ? (
                <div className="space-y-4">
                  {acceptedMembers.map((member) => {
                    const memberName = member.organizer?.businessName || (member as any).user?.name || member.organizer?.user?.email || (member as any).user?.email || 'Team Member';
                    return (
                      <div key={member.id} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-warm-300 to-warm-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {memberName[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm truncate">
                            {memberName}
                          </p>
                          <p className="text-xs text-warm-600 dark:text-warm-400 capitalize">
                            {member.role?.toLowerCase() ?? 'member'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-warm-600 dark:text-warm-400">
                    No team members yet. Invite members in workspace settings.
                  </p>
                </div>
              )}

              {/* Add Members CTA — owner only */}
              {isOwner && (
                <div className="mt-4">
                  <a
                    href="/organizer/workspace"
                    className="block w-full text-center bg-sage-50 dark:bg-gray-700 hover:bg-sage-100 dark:hover:bg-gray-600 border border-sage-200 dark:border-gray-600 text-sage-700 dark:text-sage-300 font-semibold py-2 px-4 rounded-lg text-sm transition"
                  >
                    + Invite Members
                  </a>
                </div>
              )}

              {/* Pending Invitations — owner only */}
              {isOwner && workspace.members.some((m) => !m.acceptedAt) && (
                <div className="mt-6 pt-6 border-t border-warm-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-warm-600 dark:text-warm-400 mb-3 uppercase">
                    Pending Invitations
                  </p>
                  <div className="space-y-3">
                    {workspace.members
                      .filter((m) => !m.acceptedAt)
                      .map((member) => (
                        <div key={member.id} className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                          <p className="text-xs text-warm-600 dark:text-warm-400 truncate">
                            {member.organizer?.user?.email || 'Pending member'}
                          </p>
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium ml-auto flex-shrink-0">
                            Pending
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity & Features - Right Column (spans 2) */}
          <div className="md:col-span-2 space-y-6">
            {/* Activity Feed */}
            {saleIds.length > 0 ? (
              <OrganizerActivityFeedCard
                activities={activityData?.activities || []}
                isLoading={activityLoading}
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                  Team Activity
                </h2>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    No sales yet. Create a sale to see team activity.
                  </p>
                </div>
              </div>
            )}

            {/* Team Communications */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Team Communications
              </h2>

              {allSales.length > 0 ? (
                <>
                  {/* Sale Tabs */}
                  <div className="flex gap-2 mb-4 overflow-x-auto border-b border-warm-200 dark:border-gray-700">
                    {allSales.map((sale) => (
                      <button
                        key={sale.id}
                        onClick={() => setSelectedSaleId(sale.id)}
                        className={`px-4 py-2 font-semibold text-sm whitespace-nowrap transition border-b-2 ${
                          selectedSaleId === sale.id
                            ? 'border-sage-600 text-sage-600 dark:text-sage-400'
                            : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
                        }`}
                      >
                        {sale.title}
                      </button>
                    ))}
                  </div>

                  {/* Chat Container */}
                  {selectedSaleId && (
                    <div className="flex flex-col h-80">
                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto bg-warm-50 dark:bg-gray-700 rounded-lg p-4 mb-4 space-y-3">
                        {chatLoading ? (
                          <div className="flex items-center justify-center h-full">
                            <Skeleton className="h-20 w-full" />
                          </div>
                        ) : chatData?.messages && chatData.messages.length > 0 ? (
                          <>
                            {chatData.messages.map((msg) => (
                              <div key={msg.id} className="flex gap-2">
                                <div className="flex-shrink-0">
                                  <div className="w-8 h-8 rounded-full bg-sage-200 dark:bg-sage-700 flex items-center justify-center">
                                    <span className="text-xs font-bold text-sage-900 dark:text-sage-100">
                                      {msg.organizer.businessName.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-2">
                                    <span className="font-semibold text-sm text-warm-900 dark:text-warm-100">
                                      {msg.organizer.businessName}
                                    </span>
                                    <span className="text-xs text-warm-500 dark:text-warm-400">
                                      {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <p className="text-sm text-warm-800 dark:text-warm-200 break-words">
                                    {msg.content}
                                  </p>
                                </div>
                              </div>
                            ))}
                            <div ref={messagesEndRef} />
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full text-warm-600 dark:text-warm-400 text-sm">
                            No messages yet. Start the conversation!
                          </div>
                        )}
                      </div>

                      {/* Message Input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                          placeholder="Type a message..."
                          disabled={isSending}
                          className="flex-1 px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-500 dark:placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-500 disabled:opacity-50"
                          maxLength={1000}
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={isSending || !messageInput.trim()}
                          className="px-4 py-2 bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 text-center">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Create a sale to enable team chat for quick coordination.
                  </p>
                </div>
              )}
            </div>

            {/* Tasks & Assignments */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">
                  Tasks & Assignments
                </h2>
                {(isOwner || workspace.members.some((m) => m.acceptedAt && ['ADMIN', 'MANAGER'].includes(m.role))) && (
                  <button
                    onClick={() => setShowAddTask(!showAddTask)}
                    className="px-3 py-1 bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold text-sm rounded-lg transition"
                  >
                    + Add Task
                  </button>
                )}
              </div>

              {/* Add Task Form */}
              {showAddTask && (
                <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4 mb-4 space-y-3">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task title..."
                    maxLength={200}
                    className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 placeholder-warm-500 dark:placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-sage-500"
                  />
                  <select
                    value={newTaskSaleId}
                    onChange={(e) => setNewTaskSaleId(e.target.value)}
                    className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
                  >
                    <option value="">Select a sale...</option>
                    {allSales.map((sale) => (
                      <option key={sale.id} value={sale.id}>
                        {sale.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
                  >
                    <option value="">Assign to...</option>
                    {acceptedMembers.map((member) => (
                      <option key={member.id} value={member.organizerId}>
                        {member.organizer?.businessName || member.organizer?.user?.email || 'Team Member'}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateTask}
                      disabled={isCreatingTask || !newTaskTitle.trim() || !newTaskSaleId}
                      className="flex-1 px-3 py-2 bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowAddTask(false);
                        setNewTaskTitle('');
                        setNewTaskSaleId('');
                        setNewTaskAssignee('');
                      }}
                      className="flex-1 px-3 py-2 bg-warm-200 hover:bg-warm-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-warm-900 dark:text-warm-100 font-semibold rounded-lg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Task List */}
              {tasksLoading ? (
                <Skeleton className="h-32" />
              ) : tasksData?.tasks && tasksData.tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasksData.tasks.map((task) => (
                    <div key={task.id} className="border border-warm-200 dark:border-gray-700 rounded-lg p-4 hover:bg-warm-50 dark:hover:bg-gray-700/50 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              onClick={() => handleToggleTaskStatus(task)}
                              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 transition ${
                                task.status === 'COMPLETED'
                                  ? 'bg-green-500 border-green-500'
                                  : task.status === 'IN_PROGRESS'
                                  ? 'bg-amber-500 border-amber-500'
                                  : 'border-warm-300 dark:border-gray-600 hover:border-warm-400'
                              }`}
                              title={`Status: ${task.status}`}
                            />
                            <h3 className={`font-semibold text-sm ${task.status === 'COMPLETED' ? 'line-through text-warm-500 dark:text-warm-500' : 'text-warm-900 dark:text-warm-100'}`}>
                              {task.title}
                            </h3>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center mt-2">
                            <span className="text-xs bg-warm-100 dark:bg-gray-700 text-warm-700 dark:text-warm-300 px-2 py-1 rounded">
                              {task.sale.title}
                            </span>
                            {task.assignedToInfo && (
                              <span className="text-xs bg-sage-100 dark:bg-sage-900/30 text-sage-700 dark:text-sage-300 px-2 py-1 rounded">
                                {task.assignedToInfo.businessName}
                              </span>
                            )}
                            {task.dueAt && (
                              <span className="text-xs text-warm-600 dark:text-warm-400">
                                Due: {new Date(task.dueAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-warm-600 dark:text-warm-400">
                    No tasks yet. Create one to get started!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isOwner && (
              <a
                href="/organizer/workspace"
                className="block bg-warm-50 dark:bg-gray-700 hover:bg-warm-100 dark:hover:bg-gray-600 border border-warm-200 dark:border-gray-600 rounded-lg p-4 transition text-center"
              >
                <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">Manage Workspace</p>
                <p className="text-xs text-warm-600 dark:text-warm-400">Settings, members, roles</p>
              </a>
            )}

            <a
              href="/organizer/dashboard"
              className="block bg-sage-50 dark:bg-gray-700 hover:bg-sage-100 dark:hover:bg-gray-600 border border-sage-200 dark:border-gray-600 rounded-lg p-4 transition text-center"
            >
              <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">View Sales</p>
              <p className="text-xs text-warm-600 dark:text-warm-400">All your active sales</p>
            </a>

            <a
              href="/organizer/dashboard"
              className="block bg-amber-50 dark:bg-gray-700 hover:bg-amber-100 dark:hover:bg-gray-600 border border-amber-200 dark:border-gray-600 rounded-lg p-4 transition text-center"
            >
              <p className="font-semibold text-warm-900 dark:text-warm-100 mb-1">Create Sale</p>
              <p className="text-xs text-warm-600 dark:text-warm-400">Start a new event</p>
            </a>
          </div>
        </div>

        {/* Workspace Settings */}
        {isOwner && (
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
              Workspace Settings
            </h2>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Manage members, roles, and workspace configuration.
            </p>
            <a
              href="/organizer/workspace"
              className="inline-block bg-sage-600 hover:bg-sage-700 dark:bg-sage-600 dark:hover:bg-sage-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Workspace Settings
            </a>
          </div>
        )}
      </div>
    </>
  );
}
