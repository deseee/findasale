import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface Template {
  id: string;
  title: string;
  body: string;
  category: string;
  usageCount: number;
}

interface Props {
  onSelect: (text: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: '💬 General',
  pricing: '💰 Pricing',
  pickup: '🚗 Pickup',
  availability: '📦 Availability',
};

const QuickReplyPicker: React.FC<Props> = ({ onSelect }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState('all');
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  const { data } = useQuery({
    queryKey: ['message-templates'],
    queryFn: () => api.get('/message-templates').then(r => r.data),
    enabled: !!user && user.roles?.includes('ORGANIZER'),
  });

  const useMutation_ = useMutation({
    mutationFn: (id: string) => api.post(`/message-templates/${id}/use`),
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; body: string }) => api.post('/message-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      setIsAdding(false);
      setNewTitle('');
      setNewBody('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/message-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['message-templates'] }),
  });

  if (!user || !user.roles?.includes('ORGANIZER')) return null;

  const templates: Template[] = data?.templates || [];
  const categories = ['all', ...Array.from(new Set(templates.map(t => t.category)))];
  const filtered = activeCategory === 'all' ? templates : templates.filter(t => t.category === activeCategory);

  const handleSelect = (template: Template) => {
    onSelect(template.body);
    useMutation_.mutate(template.id);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition"
        title="Quick reply templates"
      >
        ⚡ Quick Reply
        <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-warm-200 rounded-xl shadow-lg z-20 overflow-hidden">
          <div className="p-3 border-b border-warm-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-warm-900 uppercase tracking-wide">Quick Replies</p>
              <button onClick={() => setIsAdding(!isAdding)} className="text-xs text-amber-600 hover:underline">
                {isAdding ? 'Cancel' : '+ New'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-xs px-2 py-0.5 rounded-full transition ${
                    activeCategory === cat
                      ? 'bg-amber-600 text-white'
                      : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                  }`}
                >
                  {cat === 'all' ? 'All' : CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>
          </div>

          {isAdding && (
            <div className="p-3 border-b border-warm-100 bg-amber-50 space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Template name"
                className="w-full border border-warm-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder="Response text..."
                rows={3}
                className="w-full border border-warm-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
              />
              <button
                onClick={() => createMutation.mutate({ title: newTitle, body: newBody })}
                disabled={!newTitle || !newBody || createMutation.isPending}
                className="w-full bg-amber-600 text-white text-xs py-1.5 rounded font-semibold disabled:opacity-50"
              >
                Save Template
              </button>
            </div>
          )}

          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-warm-400 text-center py-4">No templates yet</p>
            ) : (
              filtered.map(template => (
                <div
                  key={template.id}
                  className="group flex items-start gap-2 p-3 hover:bg-warm-50 border-b border-warm-100 last:border-0 cursor-pointer"
                  onClick={() => handleSelect(template)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-warm-900">{template.title}</p>
                    <p className="text-xs text-warm-500 line-clamp-2 mt-0.5">{template.body}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(template.id); }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition text-xs flex-shrink-0 mt-0.5"
                    title="Delete template"
                  >
                    X
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickReplyPicker;
