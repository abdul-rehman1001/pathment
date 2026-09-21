'use client';

import { Fragment, useMemo, useState } from 'react';
import { Check, CheckCheck, SmilePlus } from 'lucide-react';

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import type { ChatMessage } from '@/lib/types/messaging';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏'];

interface MessageItemProps {
  message: ChatMessage;
  isMine: boolean;
  startsRun: boolean;
  currentUserId?: string;
  onReact: (messageId: string, emoji: string) => void | Promise<void>;
}

/**
 * Parses raw text to automatically render URLs as clickable links
 * and simple markdown (`**bold**`, `*italic*`, `` `code` ``).
 */
function FormattedMessageText({ text }: { text: string }) {
  const parts = useMemo(() => {
    // Regex for matching URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const splitByUrl = text.split(urlRegex);

    return splitByUrl.map((segment, idx) => {
      if (urlRegex.test(segment)) {
        return (
          <a
            key={idx}
            href={segment}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity break-all font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {segment}
          </a>
        );
      }

      // Simple Markdown parser for bold, italic, code
      const tokens = segment.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

      return (
        <Fragment key={idx}>
          {tokens.map((token, tokenIdx) => {
            if (
              token.startsWith('**') &&
              token.endsWith('**') &&
              token.length > 4
            ) {
              return (
                <strong key={tokenIdx} className="font-semibold">
                  {token.slice(2, -2)}
                </strong>
              );
            }
            if (
              token.startsWith('*') &&
              token.endsWith('*') &&
              token.length > 2
            ) {
              return (
                <em key={tokenIdx} className="italic">
                  {token.slice(1, -1)}
                </em>
              );
            }
            if (
              token.startsWith('`') &&
              token.endsWith('`') &&
              token.length > 2
            ) {
              return (
                <code
                  key={tokenIdx}
                  className="rounded bg-black/10 dark:bg-white/15 px-1 py-0.5 font-mono text-xs"
                >
                  {token.slice(1, -1)}
                </code>
              );
            }
            return token;
          })}
        </Fragment>
      );
    });
  }, [text]);

  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{parts}</p>;
}

export default function MessageItem({
  message,
  isMine,
  startsRun,
  currentUserId,
  onReact,
}: MessageItemProps) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [reacting, setReacting] = useState(false);
  const react = async (emoji: string) => {
    if (reacting) return;
    setReacting(true);
    setReactionsOpen(false);
    try {
      await onReact(message.id, emoji);
    } finally {
      setReacting(false);
    }
  };

  // Group reactions by emoji
  const groupedReactions = useMemo(() => {
    return (message.reactions || []).reduce(
      (acc, reaction) => {
        let entry = acc.find((item) => item.emoji === reaction.emoji);
        if (!entry) {
          entry = { emoji: reaction.emoji, count: 0, mine: false };
          acc.push(entry);
        }
        entry.count += 1;
        if (reaction.userId === currentUserId) {
          entry.mine = true;
        }
        return acc;
      },
      [] as { emoji: string; count: number; mine: boolean }[],
    );
  }, [message.reactions, currentUserId]);

  // Dynamic border radii for WhatsApp-style message grouping
  const bubbleCornersClass = isMine
    ? startsRun
      ? 'rounded-2xl rounded-tr-sm'
      : 'rounded-2xl rounded-mr-sm'
    : startsRun
      ? 'rounded-2xl rounded-tl-sm'
      : 'rounded-2xl rounded-ml-sm';

  return (
    <div
      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${
        startsRun ? 'mt-3' : 'mt-1'
      }`}
    >
      <div className="group/msg relative max-w-[85%] sm:max-w-[75%] transition-all">
        {/* Main message bubble */}
        <div
          className={`px-4 py-2.5 shadow-xs ${bubbleCornersClass} ${
            isMine
              ? 'bg-brand-600 text-white shadow-brand-600/10'
              : 'bg-card border border-border text-foreground'
          } ${message.id.startsWith('temp-') ? 'opacity-70 animate-pulse' : ''}`}
        >
          {startsRun && !isMine && (
            <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 mb-0.5">
              {`${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`.trim() ||
                'User'}
            </p>
          )}

          <FormattedMessageText text={message.messageText} />

          <div
            className={`flex items-center gap-1.5 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}
          >
            <span
              className={`text-[10px] ${isMine ? 'text-white/70' : 'text-muted-foreground'}`}
            >
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>

            {isMine &&
              (() => {
                const isTemp = message.id.startsWith('temp-');
                const isRead = Boolean(message.isRead || message.readAt);
                const isDelivered = Boolean(message.deliveredAt);

                if (isTemp) {
                  return (
                    <span className="inline-flex" title="Sending...">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin self-center" />
                    </span>
                  );
                }

                if (isRead) {
                  return (
                    <span className="inline-flex" title="Seen">
                      <CheckCheck
                        className="w-3.5 h-3.5 text-sky-300"
                        aria-label="Seen"
                      />
                    </span>
                  );
                }

                if (isDelivered) {
                  return (
                    <span className="inline-flex" title="Delivered">
                      <CheckCheck
                        className="w-3.5 h-3.5 text-white/70"
                        aria-label="Delivered"
                      />
                    </span>
                  );
                }

                return (
                  <span className="inline-flex" title="Sent">
                    <Check
                      className="w-3.5 h-3.5 text-white/60"
                      aria-label="Sent"
                    />
                  </span>
                );
              })()}
          </div>
        </div>

        <div
          className={`mt-1 flex ${isMine ? 'justify-end' : 'justify-start'}`}
        >
          <Popover open={reactionsOpen} onOpenChange={setReactionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={reacting || message.id.startsWith('temp-')}
                aria-label="Add reaction"
                className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-40"
              >
                <SmilePlus className="h-4 w-4" />
                <span className="text-[11px]">React</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align={isMine ? 'end' : 'start'}
              sideOffset={4}
              className="w-auto max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-lg !animate-none transition-opacity duration-150 motion-reduce:transition-none"
              aria-label="Choose a reaction"
            >
              <div className="flex gap-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`React with ${emoji}`}
                    aria-pressed={groupedReactions.some(
                      (g) => g.emoji === emoji && g.mine,
                    )}
                    onClick={() => {
                      void react(emoji);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-xl transition-colors duration-150 motion-reduce:transition-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Reaction chips - attached to message bottom edge */}
        {groupedReactions.length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-1 ${
              isMine ? 'justify-end pr-1' : 'pl-1'
            } relative z-[2]`}
          >
            {groupedReactions.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                disabled={reacting}
                onClick={() => void react(entry.emoji)}
                aria-pressed={entry.mine}
                aria-label={`${entry.emoji}, ${entry.count} reactions${entry.mine ? ', including you' : ''}`}
                title={
                  entry.mine
                    ? 'You reacted - click to remove'
                    : 'Click to react'
                }
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-2xs transition-colors ${
                  entry.mine
                    ? 'border-brand-500/40 ring-1 ring-brand-500/30 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'border-border bg-card text-foreground hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <span className="leading-none text-xs">{entry.emoji}</span>
                {entry.count > 1 && (
                  <span className="font-semibold text-[11px]">
                    {entry.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
