'use client';

import { Fragment, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Archive, ArrowLeft, Loader2, MessageSquare, MoreVertical, ShieldCheck, Trash2, User, UserCheck } from 'lucide-react';

import type { ChatMessage, ConversationSummary } from '@/lib/types/messaging';
import MessageItem from './MessageItem';
import MessageComposer from './MessageComposer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatWindowProps {
  selectedConversation: ConversationSummary | null;
  selectedTitle: string;
  messages: ChatMessage[];
  currentUserId?: string;
  isLoading: boolean;
  composerValue: string;
  onComposerChange: (val: string) => void;
  onSendMessage: () => void;
  isSending: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onBackToList?: () => void;
  onArchiveConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

/** Check if two ISO dates are on the same calendar day */
function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Format human date separator label */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
}

export default function ChatWindow({
  selectedConversation,
  selectedTitle,
  messages,
  currentUserId,
  isLoading,
  composerValue,
  onComposerChange,
  onSendMessage,
  isSending,
  onReact,
  onBackToList,
  onArchiveConversation,
  onDeleteConversation,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: ChatWindowProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lastConversationIdRef = useRef<string | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const conversationLoadedRef = useRef<string | null>(null);

  // Track conversation switch and reset loaded ref
  useEffect(() => {
    if (selectedConversation?.id) {
      if (lastConversationIdRef.current !== selectedConversation.id) {
        lastConversationIdRef.current = selectedConversation.id;
        conversationLoadedRef.current = null;
      }
    }
  }, [selectedConversation?.id]);

  // Scroll to bottom or to first unread message when messages populate
  useEffect(() => {
    if (selectedConversation?.id && messages.length > 0) {
      if (conversationLoadedRef.current !== selectedConversation.id) {
        conversationLoadedRef.current = selectedConversation.id;
        
        const scrollTarget = () => {
          const unreadBanner = document.getElementById('unread-banner');
          const container = scrollContainerRef.current;
          if (unreadBanner && container) {
            const containerRect = container.getBoundingClientRect();
            const bannerRect = unreadBanner.getBoundingClientRect();
            const relativeTop = bannerRect.top - containerRect.top + container.scrollTop;
            container.scrollTop = relativeTop - (container.clientHeight / 2) + (bannerRect.height / 2);
          } else if (container) {
            container.scrollTop = container.scrollHeight;
          }
        };

        requestAnimationFrame(() => {
          requestAnimationFrame(scrollTarget);
        });
      }
    }
  }, [selectedConversation?.id, messages]);

  // Scroll to bottom when new messages arrive or are sent by current user
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage && lastMessageIdRef.current !== latestMessage.id) {
        const isSentByMe = latestMessage.senderId === currentUserId;
        const container = scrollContainerRef.current;
        const isNearBottom = container ? (container.scrollHeight - container.scrollTop - container.clientHeight < 200) : false;

        lastMessageIdRef.current = latestMessage.id;

        if (isSentByMe || isNearBottom) {
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          });
        }
      }
    }
  }, [messages, currentUserId]);

  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    if (container.scrollTop === 0 && hasMore && !isLoadingMore && onLoadMore) {
      const prevScrollHeight = container.scrollHeight;
      await onLoadMore();
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight - prevScrollHeight;
      });
    }
  };

  const firstUnreadIdx = useMemo(() => {
    return messages.findIndex((m) => !m.isRead && m.senderId !== currentUserId);
  }, [messages, currentUserId]);

  const recipient = selectedConversation?.participants?.[0];

  return (
    <div className="conversation-thread flex flex-col h-full bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between bg-card/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile back button */}
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="xl:hidden p-2 -ml-1 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors shrink-0"
              aria-label="Back to conversation list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {selectedConversation ? (
            <div className="flex items-center gap-3 min-w-0">
              {recipient?.profilePictureUrl ? (
                <Image
                  src={recipient.profilePictureUrl}
                  alt={selectedTitle}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full object-cover shrink-0 border border-border"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-sm shrink-0 border border-brand-500/30">
                  {(recipient?.firstName?.[0] || selectedTitle[0] || 'C').toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-foreground font-semibold text-base truncate">
                    {selectedTitle}
                  </h2>
                  {recipient?.role === 'mentor' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-brand-500/15 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-full border border-brand-500/30">
                      <UserCheck className="w-3 h-3" /> Mentor
                    </span>
                  )}
                  {recipient?.role === 'mentee' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                      <User className="w-3 h-3" /> Mentee
                    </span>
                  )}
                  {recipient?.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/30">
                      <ShieldCheck className="w-3 h-3" /> Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {recipient?.email || 'Direct message'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-brand-500" />
              <h2 className="text-foreground font-semibold">Select a conversation</h2>
            </div>
          )}
        </div>

        {/* 3-dots header action menu */}
        {selectedConversation && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors shrink-0"
                aria-label="Chat options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => onArchiveConversation?.(selectedConversation.id)}
                className="cursor-pointer text-slate-700 dark:text-slate-300"
              >
                <Archive className="w-4 h-4 mr-2" />
                Archive Chat
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDeleteConversation?.(selectedConversation.id)}
                className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/40"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Messages Stream */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 p-4 overflow-y-auto bg-slate-100/30 dark:bg-black/25 space-y-1"
      >
        {!selectedConversation ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3 border border-brand-500/20 shadow-xs">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              Your Messages
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Select a conversation from the sidebar or start a new message to chat with your mentors, mentees, or clan members.
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4 py-4">
            {/* Skeletons simulating messages loading */}
            <div className="flex items-start gap-2 max-w-[60%]">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
              <div className="h-12 bg-slate-200 dark:bg-white/10 rounded-2xl animate-pulse flex-1" />
            </div>
            <div className="flex items-end justify-end gap-2 max-w-[60%] ml-auto">
              <div className="h-14 bg-brand-500/20 rounded-2xl animate-pulse flex-1" />
            </div>
            <div className="flex items-start gap-2 max-w-[50%]">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 animate-pulse shrink-0" />
              <div className="h-10 bg-slate-200 dark:bg-white/10 rounded-2xl animate-pulse flex-1" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3 border border-brand-500/20">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">
              No messages in this chat yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Say hi to break the ice! 👋
            </p>
          </div>
        ) : (
          <>
            {isLoadingMore && (
              <div className="flex justify-center py-2 shrink-0">
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
              </div>
            )}
            {messages.map((message, index) => {
              const mine = message.senderId === currentUserId;
              const prev = index > 0 ? messages[index - 1] : null;
              const showDateSeparator = !prev || !sameDay(prev.createdAt, message.createdAt);
              const startsRun = showDateSeparator || !prev || prev.senderId !== message.senderId;

              return (
                <Fragment key={message.id}>
                  {showDateSeparator && (
                    <div className="flex justify-center py-3">
                      <span className="rounded-full bg-card border border-border backdrop-blur-xs px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-2xs">
                        {dayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                  {index === firstUnreadIdx && (
                    <div id="unread-banner" className="flex items-center gap-4 py-4 shrink-0">
                      <div className="flex-1 h-px bg-red-500/30" />
                      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/30">
                        Unread Messages
                      </span>
                      <div className="flex-1 h-px bg-red-500/30" />
                    </div>
                  )}
                  <MessageItem
                    message={message}
                    isMine={mine}
                    startsRun={startsRun}
                    currentUserId={currentUserId}
                    onReact={onReact}
                  />
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      {/* Composer Input */}
      {selectedConversation && (
        <MessageComposer
          value={composerValue}
          onChange={onComposerChange}
          onSend={onSendMessage}
          disabled={!selectedConversation || isLoading}
          isSending={isSending}
        />
      )}
    </div>
  );
}
