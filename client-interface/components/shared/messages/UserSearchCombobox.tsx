'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, UserPlus } from 'lucide-react';
import Image from 'next/image';

import { messagingApi } from '@/lib/services/messaging-api';
import type { SearchableUser } from '@/lib/types/messaging';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  mentor: 'bg-brand-100 text-brand-700',
  mentee: 'bg-emerald-100 text-emerald-700',
};

const DEBOUNCE_MS = 300;

interface UserSearchComboboxProps {
  onSelect: (user: SearchableUser) => void;
}

export default function UserSearchCombobox({ onSelect }: UserSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>();

  // Debounce user search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // TanStack Query for user search caching & reactive state management
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['messaging', 'user-search', debouncedQuery, roleFilter],
    queryFn: () => messagingApi.searchUsers(debouncedQuery, roleFilter),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const handleSelect = (user: SearchableUser) => {
    onSelect(user);
    setOpen(false);
    setQuery('');
  };

  const roleOptions = [
    { value: undefined, label: 'All' },
    { value: 'mentor', label: 'Mentor' },
    { value: 'mentee', label: 'Mentee' },
    { value: 'admin', label: 'Admin' },
  ] as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 bg-brand-600 hover:bg-brand-700 active:scale-95 text-white rounded-xl text-xs font-semibold whitespace-nowrap shadow-xs transition-all shrink-0">
          <UserPlus className="w-3.5 h-3.5 shrink-0" />
          <span>New Chat</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or email..."
            value={query}
            onValueChange={setQuery}
          />

          {/* Role filter tabs */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
            {roleOptions.map((option) => (
              <button
                key={option.label}
                onClick={() => setRoleFilter(option.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  roleFilter === option.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-white/10 text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Search className="w-5 h-5" />
                    <span>No users found</span>
                  </div>
                </CommandEmpty>

                <CommandGroup>
                  {results.map((user) => {
                    const fullName = `${user.firstName} ${user.lastName}`.trim();

                    return (
                      <CommandItem
                        key={user.id}
                        value={user.id}
                        onSelect={() => handleSelect(user)}
                        className="flex items-center gap-3 px-2 py-2.5 cursor-pointer"
                      >
                        {/* Avatar */}
                        {user.profilePictureUrl ? (
                          <Image
                            src={user.profilePictureUrl}
                            alt={fullName}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-semibold shrink-0">
                            {(user.firstName?.[0] || '').toUpperCase()}
                            {(user.lastName?.[0] || '').toUpperCase()}
                          </div>
                        )}

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {fullName || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>

                        {/* Role badge */}
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                            ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {user.role}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
