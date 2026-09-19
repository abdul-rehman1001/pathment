import { apiClient } from './api-client';

export type OpenSourceOrg = {
  id: string;
  name: string;
  url: string;
  createdBy: string | null;
  createdAt: string;
};

export const openSourceOrgsApi = {
  list: (search?: string) =>
    apiClient.get<{ orgs: OpenSourceOrg[] }>('/open-source-orgs', {
      params: search ? { search } : undefined
    }),

  create: (data: { name: string; url: string }) =>
    apiClient.post<{ org: OpenSourceOrg }>('/open-source-orgs', data)
};
