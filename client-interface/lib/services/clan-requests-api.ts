import { apiClient } from './api-client';

/** Admin clan operations: change requests, cross-clan assignments, policies. */
export const clanRequestsApi = {
  overview: () => apiClient.get('/clan-requests'),
  listCrossClan: (clanId: string) => apiClient.get('/clan-requests/cross-clan', { params: { clanId } }),
  /**
   * `toClanId` is only ever honoured for a mentee's own request, which may
   * have named no clan, or only a preference. The server refuses to redirect
   * the other origins rather than quietly ignoring it.
   */
  resolveRequest: (id: string, status: 'approved' | 'denied', note?: string, toClanId?: string) =>
    apiClient.patch(`/clan-requests/requests/${id}/resolve`, { status, note, toClanId }),
  createCrossClan: (data: { kind: string; userId: string; toClanId: string; fromClanId?: string; note?: string }) =>
    apiClient.post('/clan-requests/cross-clan', data),
  removeCrossClan: (id: string) => apiClient.delete(`/clan-requests/cross-clan/${id}`),
  // The covering person's own surface.
  listMyCrossClan: () => apiClient.get('/clan-requests/cross-clan/mine'),
  respondCrossClan: (id: string, accept: boolean) =>
    apiClient.post(`/clan-requests/cross-clan/${id}/respond`, { accept }),
};

/** The mentee's own clan change. These can only ever act on the caller. */
export const myClanChangeApi = {
  options: () => apiClient.get('/clan-requests/my-move'),
  ask: (body: { fromClanId?: string; toClanId?: string; reasonCode: string; note: string }) =>
    apiClient.post('/clan-requests/my-move', body),
  cancel: (id: string) => apiClient.post(`/clan-requests/my-move/${id}/cancel`),
};
