import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoteMutation } from '../hooks/useVoteMutation';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
}));

const mockPost = vi.mocked(api.post);

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useVoteMutation', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('optimistically updates the resource score and reconciles with the server', async () => {
    const { queryClient, wrapper } = makeHarness();
    const { result } = renderHook(() => useVoteMutation('res-1'), { wrapper });

    // Seed the cache as the detail page would have
    queryClient.setQueryData(['resource', 'res-1'], { id: 'res-1', upvoteCount: 5 });

    mockPost.mockResolvedValue({
      data: { targetId: 'res-1', counts: { upvotes: 6, downvotes: 0, score: 6 } },
    } as never);

    act(() => {
      result.current.mutate(1);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Server response reconciles the exact score.
    const cached = queryClient.getQueryData(['resource', 'res-1']);
    expect(cached).toMatchObject({ id: 'res-1', upvoteCount: 6 });
    expect(mockPost).toHaveBeenCalledWith('/votes/toggle', {
      targetId: 'res-1',
      targetType: 'Resource',
      value: 1,
    });
  });

  it('rolls back the optimistic update when the request fails', async () => {
    const { queryClient, wrapper } = makeHarness();
    const { result } = renderHook(() => useVoteMutation('res-2'), { wrapper });

    queryClient.setQueryData(['resource', 'res-2'], { id: 'res-2', upvoteCount: 3 });

    mockPost.mockRejectedValue(new Error('network down'));

    act(() => {
      result.current.mutate(-1);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Rolled back to the pre-mutation value.
    const cached = queryClient.getQueryData(['resource', 'res-2']);
    expect(cached).toMatchObject({ id: 'res-2', upvoteCount: 3 });
  });
});
