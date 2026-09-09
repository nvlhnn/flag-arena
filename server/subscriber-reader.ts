import type { Subscriber, SubscriberLedger } from '../lib/subscribers.ts';
export async function subscriberRequest(
  path: string,
  params: Record<string, string>,
  token: string,
  reserve: () => void,
) {
  reserve();
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.search = new URLSearchParams(params).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error('Subscriber network request failed.'), {
      retryable: true,
    });
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Subscriber response could not be read.'), {
      retryable:
        response.status !== 401 &&
        response.status !== 403 &&
        response.status !== 429,
    });
  }
  if (!response.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    const message =
      response.status === 401
        ? 'Subscriber sign-in expired. Reconnect.'
        : reason === 'quotaExceeded' || reason === 'dailyLimitExceeded'
          ? 'Subscriber Google project quota exhausted. Resume after the quota resets.'
          : response.status === 429 || reason === 'rateLimitExceeded'
            ? 'Subscriber rate limit reached. Tracking paused.'
            : response.status === 403
              ? 'Subscriber access denied. Check channel permissions and API configuration.'
              : 'Subscriber service temporarily unavailable.';
    throw Object.assign(new Error(message), {
      retryable:
        response.status >= 500 ||
        response.status === 429 ||
        reason === 'rateLimitExceeded' ||
        reason === 'userRateLimitExceeded',
      invalidPage: reason === 'invalidPageToken',
    });
  }
  return data;
}
export type SubscriberPage = { records: Subscriber[]; next?: string };
export async function readSubscriberPage(
  token: string,
  reserve: () => void,
  page?: string,
): Promise<SubscriberPage> {
  const data = await subscriberRequest(
    'subscriptions',
    {
      part: 'snippet,subscriberSnippet',
      myRecentSubscribers: 'true',
      maxResults: '50',
      ...(page ? { pageToken: page } : {}),
    },
    token,
    reserve,
  );
  const records: Subscriber[] = [];
  for (const item of data.items || []) {
    const id = item.subscriberSnippet?.channelId,
      name = item.subscriberSnippet?.title,
      time = Date.parse(item.snippet?.publishedAt || '');
    if (typeof id === 'string' && typeof name === 'string')
      records.push({ id, name, publishedAt: time });
  }
  return {
    records,
    next:
      typeof data.nextPageToken === 'string' && data.nextPageToken
        ? data.nextPageToken
        : undefined,
  };
}

// Always fetch the newest page, then advance one saved catch-up job. Commit each
// page before another request so failures and restarts never discard progress.
export async function scanSubscribers(
  token: string,
  reserve: () => void,
  current: () => SubscriberLedger,
  commit: (
    page: SubscriberPage,
    jobs: NonNullable<SubscriberLedger['scanJobs']>,
    baseline: boolean,
  ) => boolean,
) {
  const head = await readSubscriberPage(token, reserve);
  let ledger = current();
  const baseline = !ledger.initialized;
  const complete = (page: SubscriberPage, full = false) =>
    !page.next ||
    (page.records.length > 0 &&
      page.records.every(
        (record) =>
          record.publishedAt < ledger.baselineAt ||
          (!full && Object.hasOwn(ledger.known, record.id)),
      ));
  let jobs = [...(ledger.scanJobs ?? [])];
  if (baseline)
    jobs = []; // Older pages predate the initial snapshot; never award them.
  else if (
    !complete(head) &&
    head.next &&
    !jobs.some((job) => job.page === head.next)
  )
    jobs.push({ page: head.next });
  if (!commit(head, jobs, baseline) || baseline || !jobs.length) return;
  const job = jobs[0];
  let page: SubscriberPage;
  try {
    page = await readSubscriberPage(token, reserve, job.page);
  } catch (error) {
    if (!(error as { invalidPage?: boolean }).invalidPage) throw error;
    // Rejected cursors restart from the newest page's continuation. Ignore known
    // overlap during this recovery scan so it can reach the interrupted backlog.
    jobs = jobs.slice(1);
    if (head.next) {
      const existing = jobs.find((job) => job.page === head.next);
      if (existing)
        jobs = jobs.map((job) =>
          job.page === head.next ? { ...job, full: true } : job,
        );
      else jobs.push({ page: head.next, full: true });
    }
    commit({ records: [] }, jobs, false);
    return;
  }
  ledger = current();
  jobs = [...(ledger.scanJobs ?? [])].filter(
    (candidate) => candidate.page !== job.page,
  );
  if (!complete(page, job.full) && page.next) {
    const existing = jobs.find((candidate) => candidate.page === page.next);
    if (existing && job.full)
      jobs = jobs.map((candidate) =>
        candidate.page === page.next ? { ...candidate, full: true } : candidate,
      );
    else if (!existing) jobs.push({ page: page.next, full: job.full });
  }
  commit(page, jobs, false);
}
